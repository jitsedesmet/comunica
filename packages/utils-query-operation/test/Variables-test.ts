import { DataFactory } from 'rdf-data-factory';
import { variablesIntersect, variablesSubsetOf } from '../lib/Variables';

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
});
