import { KeysInitQuery, KeysQueryParseRml } from '@comunica/context-entries';
import { ActionContext } from '@comunica/core';
import type { FunctionArgumentsCache, IActionContext } from '@comunica/types';
import { getSafeQuads } from '@comunica/utils-query-operation';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import type { ActorInitRml } from './ActorInitRml';

const DF = new DataFactory();

export interface IRmlMaterializeOptions {
  /**
   * The IRI to resolve generated relative IRIs against, unless a triples map defines its own.
   */
  baseIRI?: string;
  /**
   * The IRI of the directory of the mapping, to resolve relative source paths against.
   * Without it, relative source paths are resolved against the current working directory.
   */
  mappingDirectory?: string;
  /**
   * Additional context entries, such as a logger.
   */
  context?: IActionContext;
}

/**
 * Materializes RML mappings into the quads they generate.
 */
export class RmlEngineBase {
  private readonly functionArgumentsCache: FunctionArgumentsCache = {};

  public constructor(private readonly actorInitRml: ActorInitRml) {}

  /**
   * Generate the quads of an RML mapping.
   * @param mapping The RML mapping in Turtle.
   * @param options The IRIs to resolve relative IRIs and paths against.
   * @return The generated quads, without duplicates.
   */
  public async materialize(mapping: string, options: IRmlMaterializeOptions = {}): Promise<AsyncIterator<RDF.Quad>> {
    const context = this.prepareContext(options);
    const { operation } = await this.actorInitRml.mediatorQueryParse.mediate({
      query: mapping,
      queryFormat: { language: 'rml', version: '1.0' },
      baseIRI: options.baseIRI,
      context,
    });
    return getSafeQuads(await this.actorInitRml.mediatorQueryOperation.mediate({ operation, context })).quadStream;
  }

  /**
   * Create the context that the mapping is translated and evaluated with.
   * @param options The options of a materialization.
   * @return The context of the options, extended with the entries that query operations require.
   */
  protected prepareContext(options: IRmlMaterializeOptions): IActionContext {
    let context = (options.context ?? new ActionContext())
      .setDefault(KeysInitQuery.dataFactory, DF)
      .setDefault(KeysInitQuery.queryTimestamp, new Date())
      .setDefault(KeysInitQuery.functionArgumentsCache, this.functionArgumentsCache);
    if (options.baseIRI !== undefined) {
      context = context.set(KeysInitQuery.baseIRI, options.baseIRI);
    }
    if (options.mappingDirectory !== undefined) {
      context = context.set(KeysQueryParseRml.mappingDirectory, options.mappingDirectory);
    }
    return context;
  }
}
