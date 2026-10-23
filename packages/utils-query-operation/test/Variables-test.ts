import { AlgebraFactory } from '@comunica/utils-algebra';
import { DataFactory } from 'rdf-data-factory';
import { getCertainlyBoundVariables } from '../lib/Variables';

const AF = new AlgebraFactory();
const DF = new DataFactory();

describe('getCertainlyBoundVariables', () => {
  const patternA = AF.createPattern(DF.variable('a'), DF.namedNode('p'), DF.variable('x'));
  const patternB = AF.createPattern(DF.variable('b'), DF.namedNode('p'), DF.variable('x'));

  it('returns all variables of patterns, paths and bgps', async() => {
    expect(getCertainlyBoundVariables(patternA)).toEqual([ DF.variable('a'), DF.variable('x') ]);
    expect(getCertainlyBoundVariables(
      AF.createPath(DF.variable('a'), AF.createNps([]), DF.variable('b'), DF.variable('g')),
    )).toEqual([ DF.variable('a'), DF.variable('b'), DF.variable('g') ]);
    expect(getCertainlyBoundVariables(AF.createBgp([ patternA, patternB ])))
      .toEqual([ DF.variable('a'), DF.variable('x'), DF.variable('b') ]);
  });

  it('returns the variables of all join entries', async() => {
    expect(getCertainlyBoundVariables(AF.createJoin([ patternA, patternB ])))
      .toEqual([ DF.variable('a'), DF.variable('x'), DF.variable('b') ]);
  });

  it('returns the variables of the left entry of left joins and minus', async() => {
    expect(getCertainlyBoundVariables(AF.createLeftJoin(patternA, patternB)))
      .toEqual([ DF.variable('a'), DF.variable('x') ]);
    expect(getCertainlyBoundVariables(AF.createMinus(patternA, patternB)))
      .toEqual([ DF.variable('a'), DF.variable('x') ]);
  });

  it('returns the variables shared by all union entries', async() => {
    expect(getCertainlyBoundVariables(AF.createUnion([ patternA, patternB ])))
      .toEqual([ DF.variable('x') ]);
    expect(getCertainlyBoundVariables(AF.createUnion([]))).toEqual([]);
  });

  it('returns the variables of the input of single-input operations', async() => {
    expect(getCertainlyBoundVariables(AF.createFilter(patternA, AF.createTermExpression(DF.variable('a')))))
      .toEqual([ DF.variable('a'), DF.variable('x') ]);
    expect(getCertainlyBoundVariables(
      AF.createExtend(patternA, DF.variable('e'), AF.createTermExpression(DF.variable('a'))),
    )).toEqual([ DF.variable('a'), DF.variable('x') ]);
    expect(getCertainlyBoundVariables(AF.createDistinct(patternA)))
      .toEqual([ DF.variable('a'), DF.variable('x') ]);
    expect(getCertainlyBoundVariables(AF.createReduced(patternA)))
      .toEqual([ DF.variable('a'), DF.variable('x') ]);
    expect(getCertainlyBoundVariables(AF.createOrderBy(patternA, [])))
      .toEqual([ DF.variable('a'), DF.variable('x') ]);
    expect(getCertainlyBoundVariables(AF.createSlice(patternA, 0, 1)))
      .toEqual([ DF.variable('a'), DF.variable('x') ]);
    expect(getCertainlyBoundVariables(AF.createGraph(patternA, DF.namedNode('g'))))
      .toEqual([ DF.variable('a'), DF.variable('x') ]);
  });

  it('returns the graph variable and the variables of the input of graphs', async() => {
    expect(getCertainlyBoundVariables(AF.createGraph(patternA, DF.variable('g'))))
      .toEqual([ DF.variable('g'), DF.variable('a'), DF.variable('x') ]);
  });

  it('returns the projected variables of projections', async() => {
    expect(getCertainlyBoundVariables(AF.createProject(patternA, [ DF.variable('x'), DF.variable('y') ])))
      .toEqual([ DF.variable('x') ]);
  });

  it('returns the variables of values that are bound in all bindings', async() => {
    expect(getCertainlyBoundVariables(AF.createValues(
      [ DF.variable('a'), DF.variable('b') ],
      [{ a: DF.namedNode('a1'), b: DF.namedNode('b1') }, { a: DF.namedNode('a2') }],
    ))).toEqual([ DF.variable('a') ]);
  });

  it('does not consider inherited properties of values bindings', async() => {
    expect(getCertainlyBoundVariables(AF.createValues(
      [ DF.variable('constructor') ],
      [{ constructor: DF.namedNode('a1') }, {}],
    ))).toEqual([]);
  });

  it('returns no variables for other operations', async() => {
    expect(getCertainlyBoundVariables(AF.createService(patternA, DF.namedNode('e')))).toEqual([]);
  });
});
