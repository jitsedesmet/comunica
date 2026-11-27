import { KeysInitQuery, KeysQueryOperation } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { Bindings, IActionContext, IQueryOperationResultBindings } from '@comunica/types';
import { Algebra, AlgebraFactory } from '@comunica/utils-algebra';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import { assignOperationSource } from '@comunica/utils-query-operation';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorQueryOperationGraph } from '../lib/ActorQueryOperationGraph';
import '@comunica/utils-jest';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);
const AF = new AlgebraFactory(DF);

describe('ActorQueryOperationGraph', () => {
  const s = DF.variable('s');
  const g = DF.variable('g');
  const allGraphs = DF.variable('__g');
  const graph1 = DF.namedNode('ex:g1');
  const graph2 = DF.namedNode('ex:g2');
  const source = <any> { source: 'source' };
  const input = AF.createPattern(s, DF.namedNode('ex:p'), DF.variable('o'));
  const quadsIn = (graph: RDF.Term): Algebra.Operation => assignOperationSource(
    AF.createPattern(DF.variable('__s'), DF.variable('__p'), DF.variable('__o'), graph),
    source,
  );
  const inputIn = (graph: RDF.Term): Algebra.Operation =>
    Object.assign(AF.createPattern(input.subject, input.predicate, input.object, graph), { metadata: undefined });

  let actor: ActorQueryOperationGraph;
  let context: IActionContext;
  let mediatorQueryOperation: any;
  let matchingGraphs: Bindings[];
  let solutionsIn: (graph: RDF.Term) => Bindings[];
  let streams: AsyncIterator<Bindings>[];
  let graphsState: MetadataValidationState;
  let inputState: MetadataValidationState;

  beforeEach(() => {
    matchingGraphs = [ BF.bindings([[ g, graph1 ]]), BF.bindings([[ g, graph2 ]]) ];
    solutionsIn = graph => [ BF.bindings([[ s, DF.literal(`s in ${graph.value}`) ]]) ];
    streams = [];
    graphsState = new MetadataValidationState();
    inputState = new MetadataValidationState();
    mediatorQueryOperation = {
      mediate: jest.fn(async({ operation }: { operation: Algebra.Operation }) => {
        const isInput = operation.type === Algebra.Types.PATTERN;
        const bindingsStream = new ArrayIterator(
          isInput ? solutionsIn((<Algebra.Pattern> operation).graph) : matchingGraphs,
          { autoStart: false },
        );
        streams.push(bindingsStream);
        return {
          type: 'bindings',
          bindingsStream,
          metadata: async() => isInput ?
              {
                state: inputState,
                cardinality: { type: 'exact', value: 10 },
                variables: [ s, g, allGraphs ].map(variable => ({ variable, canBeUndef: true })),
              } :
              {
                state: graphsState,
                cardinality: { type: 'exact', value: matchingGraphs.length },
                variables: operation.type === Algebra.Types.DISTINCT ? [{ variable: g, canBeUndef: false }] : [],
              },
        };
      }),
    };
    actor = new ActorQueryOperationGraph({ name: 'actor', bus: new Bus({ name: 'bus' }), mediatorQueryOperation });
    context = new ActionContext({
      [KeysInitQuery.dataFactory.name]: DF,
      [KeysQueryOperation.querySources.name]: [ source ],
    });
  });

  async function run(name: RDF.Variable | RDF.NamedNode): Promise<IQueryOperationResultBindings> {
    return <IQueryOperationResultBindings> await actor.runOperation(AF.createGraph(input, name), context);
  }

  it('should test', async() => {
    await expect(actor.test({ operation: AF.createGraph(input, g), context })).resolves.toPassTestVoid();
  });

  describe('for a graph variable', () => {
    it('should evaluate the input over every named graph', async() => {
      const result = await run(g);
      await expect(result.bindingsStream).toEqualBindingsStream([
        BF.bindings([[ s, DF.literal('s in ex:g1') ], [ g, graph1 ]]),
        BF.bindings([[ s, DF.literal('s in ex:g2') ], [ g, graph2 ]]),
      ]);
      expect(mediatorQueryOperation.mediate.mock.calls.map(([ action ]: any) => action)).toEqual([
        { operation: AF.createDistinct(AF.createProject(quadsIn(g), [ g ])), context },
        { operation: inputIn(graph1), context },
        { operation: inputIn(graph2), context },
      ]);
    });

    it('should only evaluate the input once its solutions are read', async() => {
      const result = await run(g);
      expect(mediatorQueryOperation.mediate).toHaveBeenCalledTimes(1);
      await new Promise((resolve) => {
        result.bindingsStream.once('readable', resolve);
        result.bindingsStream.read();
      });
      expect(mediatorQueryOperation.mediate).toHaveBeenCalledWith({ operation: inputIn(graph1), context });
    });

    it('should end the streams of the named graphs and the input when it is destroyed', async() => {
      solutionsIn = () => Array.from({ length: 1_000 }, () => BF.bindings());
      const result = await run(g);
      await new Promise((resolve) => {
        result.bindingsStream.once('readable', resolve);
        result.bindingsStream.read();
      });
      result.bindingsStream.destroy();
      expect(streams.length).toBeGreaterThan(1);
      expect(streams.every(stream => stream.done)).toBe(true);
    });

    it('should only keep solutions that are compatible with the named graph', async() => {
      solutionsIn = () => [
        BF.bindings([[ s, DF.literal('compatible') ], [ g, graph1 ]]),
        BF.bindings([[ s, DF.literal('unbound') ]]),
      ];
      await expect((await run(g)).bindingsStream).toEqualBindingsStream([
        BF.bindings([[ s, DF.literal('compatible') ], [ g, graph1 ]]),
        BF.bindings([[ s, DF.literal('unbound') ], [ g, graph1 ]]),
        BF.bindings([[ s, DF.literal('unbound') ], [ g, graph2 ]]),
      ]);
    });

    it('should emit errors of the input', async() => {
      const result = await run(g);
      mediatorQueryOperation.mediate.mockRejectedValue(new Error('input failure'));
      await expect(result.bindingsStream.toArray()).rejects.toThrow('input failure');
    });

    it('should estimate metadata by the input over all named graphs', async() => {
      const result = await run(g);
      const metadata = await result.metadata();
      expect(metadata).toEqual({
        state: expect.any(MetadataValidationState),
        cardinality: { type: 'estimate', value: 10 },
        variables: [{ variable: s, canBeUndef: true }, { variable: g, canBeUndef: false }],
      });
      expect(mediatorQueryOperation.mediate).toHaveBeenLastCalledWith({ operation: inputIn(allGraphs), context });
      expect(streams.at(-1)!.destroyed).toBe(true);

      inputState.invalidate();
      expect(metadata.state.valid).toBe(false);
    });

    it('should invalidate metadata if the named graphs change', async() => {
      const metadata = await (await run(g)).metadata();
      graphsState.invalidate();
      expect(metadata.state.valid).toBe(false);
    });
  });

  describe('for a graph IRI', () => {
    it('should evaluate the input over an existing named graph', async() => {
      matchingGraphs = [ BF.bindings() ];
      const result = await run(graph1);
      await expect(result.bindingsStream).toEqualBindingsStream([ BF.bindings([[ s, DF.literal('s in ex:g1') ]]) ]);
      expect(mediatorQueryOperation.mediate.mock.calls.map(([ action ]: any) => action)).toEqual([
        { operation: AF.createSlice(AF.createProject(quadsIn(graph1), []), 0, 1), context },
        { operation: inputIn(graph1), context },
      ]);
    });

    it('should have no solutions and metadata for a named graph that does not exist', async() => {
      matchingGraphs = [];
      const result = await run(graph1);
      await expect(result.bindingsStream).toEqualBindingsStream([]);
      expect(mediatorQueryOperation.mediate).toHaveBeenCalledTimes(1);
      await expect(result.metadata()).resolves.toEqual({
        state: expect.any(MetadataValidationState),
        cardinality: { type: 'estimate', value: 0 },
        variables: [ s, g, allGraphs ].map(variable => ({ variable, canBeUndef: true })),
      });
      expect(mediatorQueryOperation.mediate).toHaveBeenLastCalledWith({ operation: inputIn(graph1), context });
    });
  });

  describe('createMatchingGraphsOperation', () => {
    it('should take the union over multiple sources', () => {
      const otherSource = <any> { source: 'other' };
      expect(ActorQueryOperationGraph.createMatchingGraphsOperation(g, [ source, otherSource ], DF, AF))
        .toEqual(AF.createDistinct(AF.createProject(
          AF.createUnion([ quadsIn(g), assignOperationSource(quadsIn(g), otherSource) ]),
          [ g ],
        )));
    });

    it('should have no named graphs without sources', async() => {
      context = context.delete(KeysQueryOperation.querySources);
      await run(g);
      expect(mediatorQueryOperation.mediate)
        .toHaveBeenCalledWith({ operation: AF.createDistinct(AF.createProject(AF.createUnion([]), [ g ])), context });
    });
  });
});
