import { AlgebraFactory } from '@comunica/utils-algebra';
import { DataFactory } from 'rdf-data-factory';
import { scopeOperationToGraph } from '../lib/GraphScope';

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);

describe('scopeOperationToGraph', () => {
  const s = DF.variable('s');
  const p = DF.namedNode('ex:p');
  const o = DF.variable('o');
  const graph = DF.namedNode('ex:g');
  const otherGraph = DF.namedNode('ex:other');
  const link = AF.createLink(p);
  const metadata = { a: 'b' };

  it('should scope default graph patterns and paths, and keep their metadata', () => {
    expect(scopeOperationToGraph(AF.createJoin([
      AF.createBgp([ Object.assign(AF.createPattern(s, p, o), { metadata }) ]),
      Object.assign(AF.createPath(s, link, o), { metadata }),
    ]), graph, AF)).toEqual(AF.createJoin([
      AF.createBgp([ Object.assign(AF.createPattern(s, p, o, graph), { metadata }) ]),
      Object.assign(AF.createPath(s, link, o, graph), { metadata }),
    ]));
  });

  it('should scope the patterns of EXISTS expressions', () => {
    expect(scopeOperationToGraph(
      AF.createFilter(AF.createBgp([]), AF.createExistenceExpression(false, AF.createPattern(s, p, o))),
      graph,
      AF,
    )).toEqual(AF.createFilter(
      AF.createBgp([]),
      AF.createExistenceExpression(false, Object.assign(AF.createPattern(s, p, o, graph), { metadata: undefined })),
    ));
  });

  it('should not modify patterns and paths in other graphs', () => {
    const operation = AF.createJoin([ AF.createPattern(s, p, o, otherGraph), AF.createPath(s, link, o, otherGraph) ]);
    expect(scopeOperationToGraph(operation, graph, AF)).toEqual(operation);
  });

  it('should not modify nested GRAPH and SERVICE operations', () => {
    const operation = AF.createJoin([
      AF.createGraph(AF.createPattern(s, p, o), otherGraph),
      AF.createService(AF.createPattern(s, p, o), otherGraph),
    ]);
    expect(scopeOperationToGraph(operation, graph, AF)).toEqual(operation);
  });
});
