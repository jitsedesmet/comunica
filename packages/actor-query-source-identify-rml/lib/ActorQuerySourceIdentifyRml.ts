import type { MediatorDereference } from '@comunica/bus-dereference';
import type {
  IActionQuerySourceIdentify,
  IActorQuerySourceIdentifyOutput,
  IActorQuerySourceIdentifyArgs,
  MediatorQuerySourceIdentify,
} from '@comunica/bus-query-source-identify';
import { ActorQuerySourceIdentify } from '@comunica/bus-query-source-identify';
import type { MediatorRdfParseHandle } from '@comunica/bus-rdf-parse';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import type { IActionContext, IQuerySourceSerialized } from '@comunica/types';
import { stringify as streamToString } from '@jeswr/stream-to-string';
import { Readable } from 'readable-stream';
import { resolve } from 'relative-to-absolute-iri';
import type { IRmlMapper } from './IRmlMapper';
import { RmlMapperComake } from './RmlMapperComake';

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
  /**
   * The engine that executes the mappings, which can be replaced by subclasses.
   */
  protected readonly rmlMapper: IRmlMapper = new RmlMapperComake();

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
    const { context } = action;
    const mapping = await this.dereference(<string> action.querySourceUnidentified.value, context);

    // Fetch the logical sources, as the mapper can not do this by itself
    const inputFiles: Record<string, string> = {};
    await Promise.all((await this.getLogicalSources(mapping.data, mapping.url, context)).map(async(logicalSource) => {
      inputFiles[logicalSource] = (await this.dereference(resolve(logicalSource, mapping.url), context)).data;
    }));

    // Delegate source identification to the same bus again, by passing the mapped RDF as serialized source
    const querySourceUnidentified: IQuerySourceSerialized = {
      type: 'serialized',
      value: await this.rmlMapper.map(mapping.data, inputFiles),
      mediaType: 'application/n-quads',
      context: action.querySourceUnidentified.context,
    };
    return await this.mediatorQuerySourceIdentify.mediate({ querySourceUnidentified, context });
  }

  /**
   * Fetch the contents of the document at the given URL.
   * @param url The URL or path of a document.
   * @param context The action context.
   * @return The contents of the document, and its URL after following redirects.
   */
  protected async dereference(url: string, context: IActionContext): Promise<{ data: string; url: string }> {
    const output = await this.mediatorDereference.mediate({ url, context });
    return { data: await streamToString(output.data), url: output.url };
  }

  /**
   * Determine the distinct logical sources that are referred to by name in the given mapping.
   * Logical sources that are described by a resource, such as databases, are not included.
   * @param mapping An RML mapping document, serialized as Turtle.
   * @param baseIRI The base IRI of the mapping document.
   * @param context The action context.
   */
  protected async getLogicalSources(mapping: string, baseIRI: string, context: IActionContext): Promise<string[]> {
    const { handle } = await this.mediatorRdfParse.mediate({
      context,
      handle: { metadata: { baseIRI }, data: Readable.from([ mapping ]), context },
      handleMediaType: 'text/turtle',
    });
    const logicalSources = new Set<string>();
    for await (const quad of handle.data) {
      if (quad.predicate.value === RML_SOURCE && quad.object.termType === 'Literal') {
        logicalSources.add(quad.object.value);
      }
    }
    return [ ...logicalSources ];
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
