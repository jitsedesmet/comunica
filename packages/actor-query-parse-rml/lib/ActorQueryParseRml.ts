import type { IActionQueryParse, IActorQueryParseArgs, IActorQueryParseOutput } from '@comunica/bus-query-parse';
import { ActorQueryParse } from '@comunica/bus-query-parse';
import type { MediatorRdfParseHandle } from '@comunica/bus-rdf-parse';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import type { ComunicaDataFactory } from '@comunica/types';
import { AlgebraFactory } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import arrayifyStream from 'arrayify-stream';
import { Readable } from 'readable-stream';
import { RmlMappingToAlgebraTranslator } from './RmlMappingToAlgebraTranslator';

/**
 * A comunica RML Query Parse Actor.
 * It parses an RML mapping in Turtle into an operation that constructs the quads the mapping generates.
 */
export class ActorQueryParseRml extends ActorQueryParse {
  public readonly mediatorRdfParse: MediatorRdfParseHandle;

  public constructor(args: IActorQueryParseRmlArgs) {
    super(args);
    this.mediatorRdfParse = args.mediatorRdfParse;
  }

  public async test(action: IActionQueryParse): Promise<TestResult<IActorTest>> {
    if (action.queryFormat?.language !== 'rml') {
      return failTest('This actor can only parse RML mappings');
    }
    return passTestVoid();
  }

  public async run(action: IActionQueryParse): Promise<IActorQueryParseOutput> {
    const { handle } = await this.mediatorRdfParse.mediate({
      context: action.context,
      handle: {
        data: Readable.from([ action.query ]),
        metadata: { baseIRI: action.baseIRI },
        context: action.context,
      },
      handleMediaType: 'text/turtle',
    });
    const mappingQuads: RDF.Quad[] = await arrayifyStream(handle.data);

    const dataFactory: ComunicaDataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
    const translator = new RmlMappingToAlgebraTranslator(dataFactory, new AlgebraFactory(dataFactory), action.baseIRI);
    return { operation: translator.translate(mappingQuads) };
  }
}

export interface IActorQueryParseRmlArgs extends IActorQueryParseArgs {
  /**
   * The mediator to parse the RML mapping with.
   */
  mediatorRdfParse: MediatorRdfParseHandle;
}
