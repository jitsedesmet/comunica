import { AlgebraFactory } from '@comunica/utils-algebra';
import { DataFactory } from 'rdf-data-factory';
import { getCertainlyBoundVariables, variablesIntersect, variablesSubsetOf } from '../lib/Variables';

const AF = new AlgebraFactory();
const DF = new DataFactory();

describe('Variables', () => {
  describe('variablesIntersect', () => {
    it('returns false for non-overlapping', async() => {
      expect(variablesIntersect(
        [ DF.variable('a1') ],
        [ DF.variable('a2') ],
      )).toBeFalsy();
      expect(variablesIntersect(
        [ DF.variable('a1'), DF.variable('b1') ],
        [ DF.variable('a2'), DF.variable('b2') ],
      )).toBeFalsy();
      expect(variablesIntersect(
        [],
        [ DF.variable('a2'), DF.variable('b2') ],
      )).toBeFalsy();
      expect(variablesIntersect(
        [ DF.variable('a1'), DF.variable('b1') ],
        [],
      )).toBeFalsy();
      expect(variablesIntersect(
        [],
        [],
      )).toBeFalsy();
    });

    it('returns true for equality', async() => {
      expect(variablesIntersect(
        [ DF.variable('a') ],
        [ DF.variable('a') ],
      )).toBeTruthy();
      expect(variablesIntersect(
        [ DF.variable('a'), DF.variable('b') ],
        [ DF.variable('a'), DF.variable('b') ],
      )).toBeTruthy();
    });

    it('returns true for subsets', async() => {
      expect(variablesIntersect(
        [ DF.variable('a') ],
        [ DF.variable('a'), DF.variable('b') ],
      )).toBeTruthy();
      expect(variablesIntersect(
        [ DF.variable('a'), DF.variable('b') ],
        [ DF.variable('a'), DF.variable('c'), DF.variable('b') ],
      )).toBeTruthy();
    });

    it('returns true for one common element', async() => {
      expect(variablesIntersect(
        [ DF.variable('a'), DF.variable('c') ],
        [ DF.variable('a'), DF.variable('b') ],
      )).toBeTruthy();
      expect(variablesIntersect(
        [ DF.variable('a'), DF.variable('b'), DF.variable('c') ],
        [ DF.variable('d'), DF.variable('a'), DF.variable('f') ],
      )).toBeTruthy();
    });
  });

  describe('variablesSubsetOf', () => {
    it('returns false for non-overlapping', async() => {
      expect(variablesSubsetOf(
        [ DF.variable('a1') ],
        [ DF.variable('a2') ],
      )).toBeFalsy();
      expect(variablesSubsetOf(
        [ DF.variable('a1'), DF.variable('b1') ],
        [ DF.variable('a2'), DF.variable('b2') ],
      )).toBeFalsy();
      expect(variablesSubsetOf(
        [ DF.variable('a1'), DF.variable('b1') ],
        [],
      )).toBeFalsy();
    });

    it('returns true for equality', async() => {
      expect(variablesSubsetOf(
        [ DF.variable('a') ],
        [ DF.variable('a') ],
      )).toBeTruthy();
      expect(variablesSubsetOf(
        [ DF.variable('a'), DF.variable('b') ],
        [ DF.variable('a'), DF.variable('b') ],
      )).toBeTruthy();
    });

    it('returns true for subsets', async() => {
      expect(variablesSubsetOf(
        [ DF.variable('a') ],
        [ DF.variable('a'), DF.variable('b') ],
      )).toBeTruthy();
      expect(variablesSubsetOf(
        [ DF.variable('a'), DF.variable('b') ],
        [ DF.variable('a'), DF.variable('c'), DF.variable('b') ],
      )).toBeTruthy();
      expect(variablesSubsetOf(
        [],
        [ DF.variable('a2'), DF.variable('b2') ],
      )).toBeTruthy();
      expect(variablesSubsetOf(
        [],
        [],
      )).toBeTruthy();
    });

    it('returns false for only one common element', async() => {
      expect(variablesSubsetOf(
        [ DF.variable('a'), DF.variable('c') ],
        [ DF.variable('a'), DF.variable('b') ],
      )).toBeFalsy();
      expect(variablesSubsetOf(
        [ DF.variable('a'), DF.variable('b'), DF.variable('c') ],
        [ DF.variable('d'), DF.variable('a'), DF.variable('f') ],
      )).toBeFalsy();
    });
  });

  describe('getCertainlyBoundVariables', () => {
    const patternA = AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('a'));
    const patternB = AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('b'));
    const expression = AF.createTermExpression(DF.variable('a'));

    it('returns all variables of a pattern, including within quoted triples', () => {
      expect(getCertainlyBoundVariables(AF.createPattern(
        DF.variable('s'),
        DF.namedNode('p'),
        DF.quad(DF.variable('a'), DF.namedNode('p'), DF.variable('s')),
        DF.variable('g'),
      ))).toEqual([ DF.variable('s'), DF.variable('a'), DF.variable('g') ]);
    });

    it('returns the variables of a path', () => {
      expect(getCertainlyBoundVariables(AF.createPath(
        DF.variable('s'),
        AF.createZeroOrMorePath(AF.createLink(DF.namedNode('p'))),
        DF.namedNode('o'),
        DF.variable('g'),
      ))).toEqual([ DF.variable('s'), DF.variable('g') ]);
    });

    it('returns the variables of all entries of a bgp or join', () => {
      expect(getCertainlyBoundVariables(AF.createBgp([ patternA, patternB ])))
        .toEqual([ DF.variable('s'), DF.variable('a'), DF.variable('b') ]);
      expect(getCertainlyBoundVariables(AF.createJoin([ patternA, patternB ])))
        .toEqual([ DF.variable('s'), DF.variable('a'), DF.variable('b') ]);
    });

    it('returns the variables of all entries of a union', () => {
      expect(getCertainlyBoundVariables(AF.createUnion([ patternA, patternB ]))).toEqual([ DF.variable('s') ]);
      expect(getCertainlyBoundVariables(AF.createUnion([]))).toEqual([]);
    });

    it('returns the variables of the left entry of a left join or minus', () => {
      expect(getCertainlyBoundVariables(AF.createLeftJoin(patternA, patternB)))
        .toEqual([ DF.variable('s'), DF.variable('a') ]);
      expect(getCertainlyBoundVariables(AF.createMinus(patternA, patternB)))
        .toEqual([ DF.variable('s'), DF.variable('a') ]);
    });

    it('returns the projected or grouped variables', () => {
      expect(getCertainlyBoundVariables(AF.createProject(patternA, [ DF.variable('a'), DF.variable('x') ])))
        .toEqual([ DF.variable('a') ]);
      expect(getCertainlyBoundVariables(AF.createGroup(patternA, [ DF.variable('s') ], [])))
        .toEqual([ DF.variable('s') ]);
    });

    it('returns the variables of a graph and its name', () => {
      expect(getCertainlyBoundVariables(AF.createGraph(patternA, DF.variable('g'))))
        .toEqual([ DF.variable('s'), DF.variable('a'), DF.variable('g') ]);
      expect(getCertainlyBoundVariables(AF.createGraph(patternA, DF.namedNode('g'))))
        .toEqual([ DF.variable('s'), DF.variable('a') ]);
    });

    it('returns the variables of values that are bound in all bindings', () => {
      expect(getCertainlyBoundVariables(AF.createValues(
        [ DF.variable('a'), DF.variable('b') ],
        [{ a: DF.namedNode('a1'), b: DF.namedNode('b1') }, { a: DF.namedNode('a2') }],
      ))).toEqual([ DF.variable('a') ]);
    });

    it('returns the variables of the input of operations that do not bind variables', () => {
      for (const operation of [
        AF.createFilter(patternA, expression),
        AF.createExtend(patternA, DF.variable('x'), expression),
        AF.createDistinct(patternA),
        AF.createReduced(patternA),
        AF.createOrderBy(patternA, [ expression ]),
        AF.createSlice(patternA, 0, 1),
        AF.createFrom(patternA, [], []),
        AF.createService(patternA, DF.namedNode('service')),
      ]) {
        expect(getCertainlyBoundVariables(operation)).toEqual([ DF.variable('s'), DF.variable('a') ]);
      }
    });

    it('returns no variables for silent services and other operations', () => {
      expect(getCertainlyBoundVariables(AF.createService(patternA, DF.namedNode('service'), true))).toEqual([]);
      expect(getCertainlyBoundVariables(AF.createNop())).toEqual([]);
    });
  });
});
