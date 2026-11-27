import type { IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { ActorQueryOperationTypedMediated } from '@comunica/bus-query-operation';
import { KeysInitQuery, KeysQueryOperation } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';
import type {
  BindingsStream,
  ComunicaDataFactory,
  IActionContext,
  IQueryOperationResult,
  IQuerySourceWrapper,
  MetadataBindings,
} from '@comunica/types';
import { Algebra, AlgebraFactory } from '@comunica/utils-algebra';
import { MetadataValidationState } from '@comunica/utils-metadata';
import { getSafeBindings, scopeOperationToGraph, unionOperationOverSources } from '@comunica/utils-query-operation';
import type * as RDF from '@rdfjs/types';
import { MultiTransformIterator, TransformIterator } from 'asynciterator';

/**
 * A comunica Graph Query Operation Actor.
 *
 * It evaluates the input of a GRAPH operation over every named graph that matches the graph name separately,
 * as defined in https://www.w3.org/TR/sparql12-query/#defn_evalGraph.
 */
export class ActorQueryOperationGraph extends ActorQueryOperationTypedMediated<Algebra.Graph> {
  public constructor(args: IActorQueryOperationTypedMediatedArgs) {
    super(args, Algebra.Types.GRAPH);
  }

  public async testOperation(_operation: Algebra.Graph, _context: IActionContext): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async runOperation(operation: Algebra.Graph, context: IActionContext): Promise<IQueryOperationResult> {
    const dataFactory: ComunicaDataFactory = context.getSafe(KeysInitQuery.dataFactory);
    const algebraFactory = new AlgebraFactory(dataFactory);
    const { input, name } = operation;

    const matchingGraphs = getSafeBindings(await this.mediatorQueryOperation.mediate({
      operation: ActorQueryOperationGraph.createMatchingGraphsOperation(
        name,
        context.get(KeysQueryOperation.querySources) ?? [],
        dataFactory,
        algebraFactory,
      ),
      context,
    }));

    // The input is evaluated lazily for every matching graph, in the order in which these graphs are discovered.
    const bindingsStream: BindingsStream = new MultiTransformIterator(matchingGraphs.bindingsStream, {
      autoStart: false,
      multiTransform: (graphBindings: RDF.Bindings) => new TransformIterator(async() => {
        const graph = name.termType === 'Variable' ? graphBindings.get(name)! : name;
        const output = getSafeBindings(await this.mediatorQueryOperation.mediate({
          operation: scopeOperationToGraph(input, graph, algebraFactory),
          context,
        }));
        // Solutions in which the input bound the graph variable to another term are not compatible.
        return output.bindingsStream.map(bindings => bindings.merge(graphBindings) ?? null);
      }, { maxBufferSize: 128, autoStart: false }),
    });

    // The solutions over the matching graphs are not known upfront, so their metadata is estimated by the input
    // over all named graphs at once for a graph variable, or over the named graph itself for an IRI.
    const metadata = async(): Promise<MetadataBindings> => {
      const allGraphs = name.termType === 'Variable' ? dataFactory.variable('__g') : name;
      const inputOverAllGraphs = getSafeBindings(await this.mediatorQueryOperation.mediate({
        operation: scopeOperationToGraph(input, allGraphs, algebraFactory),
        context,
      }));
      inputOverAllGraphs.bindingsStream.destroy();
      const metadatas = await Promise.all([ matchingGraphs.metadata(), inputOverAllGraphs.metadata() ]);
      const [ graphsMetadata, inputMetadata ] = metadatas;
      const state = new MetadataValidationState();
      for (const { state: subState } of metadatas) {
        subState.addInvalidateListener(() => state.invalidate());
      }
      return {
        state,
        cardinality: {
          type: 'estimate',
          value: graphsMetadata.cardinality.value > 0 ? inputMetadata.cardinality.value : 0,
        },
        variables: [
          ...inputMetadata.variables
            .filter(({ variable }) => !variable.equals(name) && !variable.equals(allGraphs)),
          ...graphsMetadata.variables,
        ],
      };
    };

    return { type: 'bindings', bindingsStream, metadata };
  }

  /**
   * Create an operation that has one solution for every named graph that matches the name of a GRAPH operation.
   * Graph variables are bound in these solutions, while the solution of an IRI that names a graph is empty.
   * A named graph exists if at least one of the sources has a quad in it.
   * @param graphName The name of a GRAPH operation.
   * @param sources The sources that make up the dataset.
   * @param dataFactory The data factory.
   * @param algebraFactory The algebra factory.
   * @return The operation, of which all quad patterns have a source.
   */
  public static createMatchingGraphsOperation(
    graphName: RDF.Variable | RDF.NamedNode,
    sources: IQuerySourceWrapper[],
    dataFactory: ComunicaDataFactory,
    algebraFactory: AlgebraFactory,
  ): Algebra.Operation {
    const quadsInGraph = unionOperationOverSources(
      algebraFactory.createPattern(
        dataFactory.variable('__s'),
        dataFactory.variable('__p'),
        dataFactory.variable('__o'),
        graphName,
      ),
      sources,
      algebraFactory,
    );
    return graphName.termType === 'Variable' ?
      algebraFactory.createDistinct(algebraFactory.createProject(quadsInGraph, [ graphName ])) :
      algebraFactory.createSlice(algebraFactory.createProject(quadsInGraph, []), 0, 1);
  }
}
