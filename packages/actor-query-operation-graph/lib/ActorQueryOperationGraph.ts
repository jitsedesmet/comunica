import type { IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { ActorQueryOperationTypedMediated } from '@comunica/bus-query-operation';
import { KeysInitQuery, KeysQueryOperation } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';
import type {
  Bindings,
  BindingsStream,
  ComunicaDataFactory,
  IActionContext,
  IQueryOperationResult,
  MetadataBindings,
} from '@comunica/types';
import { Algebra, AlgebraFactory } from '@comunica/utils-algebra';
import { createDerivedMetadataState } from '@comunica/utils-metadata';
import {
  assignOperationSource,
  doesShapeAcceptOperation,
  getOperationDatasetSources,
  getSafeBindings,
  getSourceSelectorShape,
  groupRepeatedSubOperations,
  materializeTerm,
  scopeOperationToGraph,
} from '@comunica/utils-query-operation';
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

    // The evaluations of the input are grouped in the physical query plan, as there is one for every matching graph.
    const matchingGraphs = getSafeBindings(await this.mediatorQueryOperation.mediate({
      operation: await ActorQueryOperationGraph.createMatchingGraphsOperation(operation, context, algebraFactory),
      context,
    }));
    const inputContext = groupRepeatedSubOperations(context, 'graphs', this.name);

    // With a union default graph, quad patterns with a graph variable also match the default graph.
    const namedGraphs = matchingGraphs.bindingsStream
      .filter(graphBindings => materializeTerm(name, graphBindings).termType !== 'DefaultGraph');

    // The input is evaluated lazily for every matching graph, in the order in which these graphs are discovered.
    const bindingsStream: BindingsStream = new MultiTransformIterator(namedGraphs, {
      autoStart: false,
      multiTransform: (graphBindings: Bindings) => new TransformIterator(async() => {
        const output = getSafeBindings(await this.mediatorQueryOperation.mediate({
          operation: scopeOperationToGraph(input, materializeTerm(name, graphBindings), algebraFactory),
          context: inputContext,
        }));
        // Solutions in which the input bound the graph variable to another term are not compatible.
        return output.bindingsStream.map(bindings => bindings.merge(graphBindings) ?? null);
      }, { maxBufferSize: 128, autoStart: false }),
    });

    // The solutions are not known upfront, so their metadata is estimated by the input
    // over all named graphs at once for a graph variable, or over the named graph for an IRI.
    const metadata = async(): Promise<MetadataBindings> => {
      const estimationGraph = name.termType === 'Variable' ? dataFactory.variable('__g') : name;
      const inputEstimate = getSafeBindings(await this.mediatorQueryOperation.mediate({
        operation: scopeOperationToGraph(input, estimationGraph, algebraFactory),
        context: inputContext,
      }));
      inputEstimate.bindingsStream.destroy();
      const metadatas = await Promise.all([ matchingGraphs.metadata(), inputEstimate.metadata() ]);
      const [ graphsMetadata, inputMetadata ] = metadatas;
      return {
        state: createDerivedMetadataState(metadatas),
        cardinality: {
          type: 'estimate',
          value: graphsMetadata.cardinality.value > 0 ? inputMetadata.cardinality.value : 0,
        },
        variables: [
          ...inputMetadata.variables
            .filter(({ variable }) => !variable.equals(name) && !variable.equals(estimationGraph)),
          ...graphsMetadata.variables,
        ],
      };
    };

    return { type: 'bindings', bindingsStream, metadata };
  }

  /**
   * Create an operation that has one solution for every named graph that matches the name of a GRAPH operation.
   * Graph variables are bound in these solutions, while the solution of an IRI that names a graph is empty.
   * A named graph exists if at least one of the sources of the dataset has a quad in it.
   * @param operation A GRAPH operation, which ranges over its dataset sources, or else over all query sources.
   * @param context The action context.
   * @param algebraFactory The algebra factory.
   * @return The operation, which is fully assigned to sources.
   */
  public static async createMatchingGraphsOperation(
    operation: Algebra.Graph,
    context: IActionContext,
    algebraFactory: AlgebraFactory,
  ): Promise<Algebra.Operation> {
    const graphName = operation.name;
    const dataFactory = <ComunicaDataFactory> algebraFactory.dataFactory;
    const quadsInGraph = algebraFactory.createPattern(
      dataFactory.variable('__s'),
      dataFactory.variable('__p'),
      dataFactory.variable('__o'),
      graphName,
    );
    const graphsOf = (quads: Algebra.Operation): Algebra.Operation => graphName.termType === 'Variable' ?
      algebraFactory.createDistinct(algebraFactory.createProject(quads, [ graphName ])) :
      algebraFactory.createSlice(algebraFactory.createProject(quads, []), 0, 1);

    // Sources that accept the full operation only have to produce their graphs, instead of all quads within them.
    const sources = getOperationDatasetSources(operation) ?? context.get(KeysQueryOperation.querySources) ?? [];
    const graphsPerSource = await Promise.all(sources.map(async source =>
      doesShapeAcceptOperation(await getSourceSelectorShape(source, context), graphsOf(quadsInGraph)) ?
        assignOperationSource(graphsOf(quadsInGraph), source) :
        graphsOf(assignOperationSource(quadsInGraph, source))));
    return graphsPerSource.length === 1 ? graphsPerSource[0] : graphsOf(algebraFactory.createUnion(graphsPerSource));
  }
}
