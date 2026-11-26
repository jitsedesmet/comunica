import { parseTurtle } from '@comake/rmlmapper-js';
import type { MediatorDereference } from '@comunica/bus-dereference';
import type {
  IActionQuerySourceIdentify,
  IActorQuerySourceIdentifyOutput,
  IActorQuerySourceIdentifyArgs,
  MediatorQuerySourceIdentify,
} from '@comunica/bus-query-source-identify';
import { ActorQuerySourceIdentify } from '@comunica/bus-query-source-identify';
import type { MediatorRdfParseHandle } from '@comunica/bus-rdf-parse';
import { KeysDereference } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import type { IActionContext, IQuerySourceSerialized } from '@comunica/types';
import { termToString } from 'rdf-string-ttl';
import { Readable } from 'readable-stream';
import { resolve } from 'relative-to-absolute-iri';

const RML_SOURCE = 'http://semweb.mmlab.be/ns/rml#source';

/**
 * A comunica RML Query Source Identify Actor.
 *
 * It executes an RML mapping, and exposes the generated RDF as a query source.
 */
export class ActorQuerySourceIdentifyRml extends ActorQuerySourceIdentify {
  public readonly mediatorDereference: MediatorDereference;
  public readonly mediatorRdfParse: MediatorRdfParseHandle;
  public readonly mediatorQuerySourceIdentify: MediatorQuerySourceIdentify;

  public constructor(args: IActorQuerySourceIdentifyRmlArgs) {
    super(args);
    this.mediatorDereference = args.mediatorDereference;
    this.mediatorRdfParse = args.mediatorRdfParse;
    this.mediatorQuerySourceIdentify = args.mediatorQuerySourceIdentify;
  }

  public async test(action: IActionQuerySourceIdentify): Promise<TestResult<IActorTest>> {
    const source = action.querySourceUnidentified;
    if (source.type !== 'rml') {
      return failTest(`${this.name} requires a single query source with rml type to be present in the context.`);
    }
    if (typeof source.value !== 'string') {
      return failTest(`${this.name} requires an rml source with the URL of a mapping document as value.`);
    }
    return passTestVoid();
  }

  public async run(action: IActionQuerySourceIdentify): Promise<IActorQuerySourceIdentifyOutput> {
    const sourceContext = action.querySourceUnidentified.context;
    // Delegate source identification to the same bus again, by passing the mapped RDF as serialized source
    const querySourceUnidentified: IQuerySourceSerialized = {
      type: 'serialized',
      value: await this.materialize(
        <string> action.querySourceUnidentified.value,
        sourceContext ? action.context.merge(sourceContext) : action.context,
      ),
      mediaType: 'application/n-quads',
      context: sourceContext,
    };
    return await this.mediatorQuerySourceIdentify.mediate({ querySourceUnidentified, context: action.context });
  }

  /**
   * Execute the RML mapping at the given URL.
   * @param mappingUrl The URL or path of an RML mapping document in Turtle.
   * @param context The action context for fetching the mapping and its logical sources.
   * @return The generated RDF, serialized as N-Quads.
   */
  protected async materialize(mappingUrl: string, context: IActionContext): Promise<string> {
    const mappingDocument = await this.dereference(mappingUrl, context);
    const { mapping, logicalSources } = await this.parseMapping(mappingDocument.data, mappingDocument.url, context);

    // Fetch the logical sources, as the mapper can not do this by itself.
    // Mappings from the Web may not read local files, as they could otherwise expose them.
    const logicalSourceContext = /^https?:/u.test(mappingDocument.url) ?
      context.set(KeysDereference.blockFileAccess, true) :
      context;
    const inputFiles = Object.fromEntries(await Promise.all(logicalSources.map(async logicalSource => [
      logicalSource,
      (await this.dereference(resolve(logicalSource, mappingDocument.url), logicalSourceContext)).data,
    ])));
    return await this.map(mapping, inputFiles);
  }

  /**
   * Execute an RML mapping.
   * Subclasses can override this to use another RML engine.
   * @param mapping An RML mapping document, serialized as Turtle.
   * @param inputFiles The contents of the logical sources, keyed by the `rml:source` value they have in the mapping.
   * @return The generated RDF, serialized as N-Quads.
   */
  protected async map(mapping: string, inputFiles: Record<string, string>): Promise<string> {
    return <string> await parseTurtle(mapping, inputFiles, { toRDF: true });
  }

  /**
   * Fetch the contents of the document at the given URL.
   * @param url The URL or path of a document.
   * @param context The action context.
   * @return The contents of the document, and its URL after following redirects.
   */
  protected async dereference(url: string, context: IActionContext): Promise<{ data: string; url: string }> {
    const output = await this.mediatorDereference.mediate({ url, context });
    if (!output.exists) {
      throw new Error(`${this.name} could not fetch ${url}`);
    }
    // Decode in streaming mode, as characters can be split across chunks
    const decoder = new TextDecoder();
    let data = '';
    for await (const chunk of output.data) {
      data += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    }
    data += decoder.decode();
    return { data, url: output.url };
  }

  /**
   * Parse the given mapping to determine its logical sources, and to make its IRIs absolute,
   * as the mapper does not resolve them against the URL of the mapping document.
   * @param mapping An RML mapping document, serialized as Turtle.
   * @param baseIRI The base IRI of the mapping document.
   * @param context The action context.
   * @return The mapping without relative IRIs, and the distinct logical sources it refers to.
   */
  protected async parseMapping(
    mapping: string,
    baseIRI: string,
    context: IActionContext,
  ): Promise<{ mapping: string; logicalSources: string[] }> {
    const { handle } = await this.mediatorRdfParse.mediate({
      context,
      handle: { metadata: { baseIRI }, data: Readable.from([ mapping ]), context },
      handleMediaType: 'text/turtle',
    });
    const triples: string[] = [];
    const logicalSources = new Set<string>();
    for await (const quad of handle.data) {
      if (quad.predicate.value === RML_SOURCE) {
        if (quad.object.termType !== 'Literal') {
          throw new Error(`${this.name} only supports logical sources that are referred to by name, but got ${termToString(quad.object)}`);
        }
        logicalSources.add(quad.object.value);
      }
      triples.push(`${termToString(quad.subject)} ${termToString(quad.predicate)} ${termToString(quad.object)} .`);
    }
    return { mapping: triples.join('\n'), logicalSources: [ ...logicalSources ]};
  }
}

export interface IActorQuerySourceIdentifyRmlArgs extends IActorQuerySourceIdentifyArgs {
  /**
   * The dereference mediator, for fetching the mapping document and its logical sources.
   */
  mediatorDereference: MediatorDereference;
  /**
   * The RDF parse mediator, for parsing the mapping document.
   */
  mediatorRdfParse: MediatorRdfParseHandle;
  /**
   * The query source identify mediator.
   */
  mediatorQuerySourceIdentify: MediatorQuerySourceIdentify;
}
