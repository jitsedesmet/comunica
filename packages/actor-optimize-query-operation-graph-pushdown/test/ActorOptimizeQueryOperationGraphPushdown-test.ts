import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import type { Algebra } from '@comunica/utils-algebra';
import { AlgebraFactory } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type { ActiveGraphDependence } from '../lib/ActorOptimizeQueryOperationGraphPushdown';
import { ActorOptimizeQueryOperationGraphPushdown } from '../lib/ActorOptimizeQueryOperationGraphPushdown';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);

describe('ActorOptimizeQueryOperationGraphPushdown', () => {
  let actor: ActorOptimizeQueryOperationGraphPushdown;
  let context: IActionContext;

  const s = DF.variable('s');
  const o = DF.variable('o');
  const x = DF.variable('x');
  const p = DF.namedNode('ex:p');
  const graphVariable = DF.variable('g');
  const graphIri = DF.namedNode('ex:g');
  const otherGraph = DF.namedNode('ex:other');

  const pattern = (graph?: RDF.Term): Algebra.Pattern => AF.createPattern(s, p, o, graph);
  const values = AF.createValues([ x ], [{ x: DF.literal('1') }]);
  const unknown = AF.createNop();
  const term = (variable: RDF.Variable): Algebra.Expression => AF.createTermExpression(variable);
  const bound = (variable: RDF.Variable): Algebra.Expression =>
    AF.createOperatorExpression('bound', [ term(variable) ]);

  beforeEach(() => {
    actor = new ActorOptimizeQueryOperationGraphPushdown({ name: 'actor', bus: new Bus({ name: 'bus' }) });
    context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
  });

  async function optimize(operation: Algebra.Operation): Promise<Algebra.Operation> {
    return (await actor.run({ operation, context })).operation;
  }

  it('should test', async() => {
    await expect(actor.test({ operation: <any> undefined, context })).resolves.toPassTestVoid();
  });

  describe('run', () => {
    it('should not change operations without GRAPH operations', async() => {
      const action = { operation: AF.createProject(pattern(), [ s ]), context: new ActionContext() };
      await expect(actor.run(action)).resolves.toEqual(action);
    });

    it('should push a GRAPH operation into matching patterns and paths', async() => {
      const link = AF.createLink(p);
      await expect(optimize(AF.createGraph(
        AF.createJoin([ AF.createBgp([ pattern() ]), AF.createPath(s, link, o) ]),
        graphVariable,
      ))).resolves.toEqual(AF.createJoin([
        AF.createBgp([ pattern(graphVariable) ]),
        AF.createPath(s, link, o, graphVariable),
      ]));
    });

    it('should keep a GRAPH operation with an input that does not match the graph', async() => {
      const operation = AF.createProject(AF.createGraph(values, graphIri), [ x ]);
      await expect(optimize(operation)).resolves.toEqual(operation);
    });

    it('should push nested GRAPH operations into their own patterns', async() => {
      await expect(optimize(AF.createGraph(
        AF.createJoin([ pattern(), AF.createGraph(pattern(), graphIri) ]),
        graphVariable,
      ))).resolves.toEqual(AF.createJoin([ pattern(graphVariable), pattern(graphIri) ]));
    });

    it('should push a GRAPH operation around a nested GRAPH operation that is kept', async() => {
      const nested = AF.createGraph(AF.createProject(pattern(), [ s ]), graphVariable);
      await expect(optimize(AF.createGraph(AF.createJoin([ pattern(), nested ]), graphIri)))
        .resolves.toEqual(AF.createJoin([ pattern(graphIri), nested ]));
    });
  });

  describe('getActiveGraphDependence', () => {
    const zeroOrMore = AF.createPath(s, AF.createZeroOrMorePath(AF.createLink(p)), o);
    // Each case has an operation, its dependence for a graph variable, and for a graph IRI if that differs.
    const cases: [ string, Algebra.Operation, ActiveGraphDependence, ActiveGraphDependence? ][] = [
      [ 'a pattern', pattern(), 'matching' ],
      [ 'a pattern in another graph', pattern(otherGraph), 'independent' ],
      [ 'a path', AF.createPath(s, AF.createSeq([ AF.createLink(p), AF.createLink(p) ]), o), 'matching' ],
      [ 'a path in another graph', AF.createPath(s, AF.createLink(p), o, otherGraph), 'independent' ],
      [ 'a zero-or-more path', zeroOrMore, 'unknown' ],
      [ 'a zero-or-one path', AF.createPath(s, AF.createZeroOrOnePath(AF.createLink(p)), o), 'unknown' ],
      [ 'a BGP', AF.createBgp([ pattern(otherGraph), pattern() ]), 'matching' ],
      [ 'a BGP in another graph', AF.createBgp([ pattern(otherGraph) ]), 'independent' ],
      [ 'an empty BGP', AF.createBgp([]), 'independent' ],
      [ 'values', values, 'independent' ],
      [ 'a GRAPH operation', AF.createGraph(pattern(), graphVariable), 'independent' ],
      [ 'a SERVICE operation', AF.createService(pattern(), otherGraph), 'independent' ],
      [ 'a join with a matching entry', AF.createJoin([ values, pattern() ]), 'matching' ],
      [ 'a join without matching entries', AF.createJoin([ values, values ], false), 'independent' ],
      [ 'a join with an unknown entry', AF.createJoin([ pattern(), unknown ]), 'unknown' ],
      [ 'a union of matching entries', AF.createUnion([ pattern(), pattern() ]), 'matching' ],
      [ 'a union of mixed entries', AF.createUnion([ pattern(), values ]), 'unknown' ],
      [ 'an empty union', AF.createUnion([]), 'unknown' ],
      [ 'a left join of matching entries', AF.createLeftJoin(pattern(), pattern(), bound(s)), 'matching' ],
      [ 'a left join with independent right', AF.createLeftJoin(pattern(), values), 'matching' ],
      [ 'a left join of independent entries', AF.createLeftJoin(values, values), 'independent' ],
      [ 'a left join with only a matching right', AF.createLeftJoin(values, pattern()), 'unknown' ],
      [ 'a left join with unknown left', AF.createLeftJoin(unknown, pattern()), 'unknown' ],
      [ 'a left join with unknown right', AF.createLeftJoin(pattern(), unknown), 'unknown' ],
      [
        'a left join with the graph variable in its right',
        AF.createLeftJoin(pattern(), AF.createPattern(s, p, graphVariable)),
        'unknown',
        'matching',
      ],
      [
        'a left join on the graph variable',
        AF.createLeftJoin(pattern(), pattern(), bound(graphVariable)),
        'unknown',
        'matching',
      ],
      [ 'a filter', AF.createFilter(pattern(), bound(s)), 'matching' ],
      [ 'a filter on the graph variable', AF.createFilter(pattern(), bound(graphVariable)), 'unknown', 'matching' ],
      [
        'a filter on the existence of the graph variable',
        AF.createFilter(pattern(), AF.createExistenceExpression(
          false,
          AF.createPattern(DF.quad(s, p, graphVariable), p, o),
        )),
        'unknown',
        'matching',
      ],
      [ 'an extend', AF.createExtend(pattern(), x, term(s)), 'matching' ],
      [ 'an extend to the graph variable', AF.createExtend(pattern(), graphVariable, term(s)), 'unknown', 'matching' ],
      [ 'an extend of the graph variable', AF.createExtend(pattern(), x, term(graphVariable)), 'unknown', 'matching' ],
      [ 'a project', AF.createProject(pattern(), [ s ]), 'unknown', 'matching' ],
      [ 'a distinct', AF.createDistinct(pattern()), 'unknown', 'matching' ],
      [ 'a reduced', AF.createReduced(values), 'unknown', 'independent' ],
      [ 'an order by', AF.createOrderBy(pattern(), [ term(s) ]), 'unknown', 'matching' ],
      [ 'a slice', AF.createSlice(pattern(), 0, 1), 'unknown', 'matching' ],
      [ 'a minus', AF.createMinus(pattern(), values), 'unknown', 'matching' ],
      [ 'a minus from independent solutions', AF.createMinus(values, pattern()), 'unknown' ],
      [ 'a group with variables', AF.createGroup(pattern(), [ s ], []), 'unknown', 'matching' ],
      [ 'a group without variables', AF.createGroup(pattern(), [], []), 'unknown' ],
      [ 'other operations', unknown, 'unknown' ],
    ];

    it.each(cases)('should handle %s', (_name, operation, forVariable, forIri = forVariable) => {
      expect(ActorOptimizeQueryOperationGraphPushdown.getActiveGraphDependence(operation, graphVariable))
        .toBe(forVariable);
      expect(ActorOptimizeQueryOperationGraphPushdown.getActiveGraphDependence(operation, graphIri)).toBe(forIri);
    });
  });

  describe('containsVariable', () => {
    it('should find variables in terms', () => {
      expect(ActorOptimizeQueryOperationGraphPushdown.containsVariable(term(x), x)).toBe(true);
      expect(ActorOptimizeQueryOperationGraphPushdown.containsVariable(term(s), x)).toBe(false);
      expect(ActorOptimizeQueryOperationGraphPushdown.containsVariable(DF.literal('x'), x)).toBe(false);
    });

    it('should find variables in the operations of expressions', () => {
      expect(ActorOptimizeQueryOperationGraphPushdown
        .containsVariable(AF.createExistenceExpression(true, AF.createJoin([ values, pattern() ])), x)).toBe(true);
      expect(ActorOptimizeQueryOperationGraphPushdown
        .containsVariable(AF.createExistenceExpression(true, pattern()), x)).toBe(false);
    });

    it('should not find variables in metadata', () => {
      expect(ActorOptimizeQueryOperationGraphPushdown
        .containsVariable(Object.assign(term(s), { metadata: { variable: x }}), x)).toBe(false);
    });
  });
});
