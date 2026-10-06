import { AlgebraFactory } from '@comunica/utils-algebra';
import { DataFactory } from 'rdf-data-factory';
import { getExpressionVariables } from '../lib/Expressions';

const AF = new AlgebraFactory();
const DF = new DataFactory();

describe('Expressions', () => {
  describe('getExpressionVariables', () => {
    it('returns undefined for aggregates', async() => {
      expect(() => getExpressionVariables(
        AF.createAggregateExpression('sum', AF.createTermExpression(DF.namedNode('s')), true),
      )).toThrow(`Getting expression variables is not supported for aggregate`);
    });

    it('returns undefined for wildcard', async() => {
      expect(() => getExpressionVariables(
        AF.createWildcardExpression(),
      )).toThrow(`Getting expression variables is not supported for wildcard`);
    });

    it('returns undefined for existence', async() => {
      expect(getExpressionVariables(
        AF.createExistenceExpression(false, AF.createPattern(DF.namedNode('s'), DF.variable('p'), DF.variable('o'))),
      )).toEqual([
        DF.variable('p'),
        DF.variable('o'),
      ]);
    });

    it('returns the variables of expressions and nested existence patterns within existence', async() => {
      expect(getExpressionVariables(AF.createExistenceExpression(false, AF.createFilter(
        AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.namedNode('o')),
        AF.createOperatorExpression('||', [
          AF.createTermExpression(DF.variable('a')),
          AF.createExistenceExpression(false, AF.createPath(
            DF.variable('b'),
            AF.createLink(DF.namedNode('p')),
            DF.quad(DF.variable('c'), DF.namedNode('p'), DF.namedNode('o')),
          )),
          AF.createExistenceExpression(false, AF.createPattern(
            DF.variable('d'),
            DF.namedNode('p'),
            DF.namedNode('o'),
          )),
        ]),
      )))).toEqual([
        DF.variable('s'),
        DF.variable('a'),
        DF.variable('b'),
        DF.variable('c'),
        DF.variable('d'),
      ]);
    });

    it('returns empty array for a named expression without arguments', async() => {
      expect(getExpressionVariables(
        AF.createNamedExpression(DF.namedNode('s'), []),
      )).toEqual([]);
    });

    it('returns the variables in the arguments of a named expression', async() => {
      expect(getExpressionVariables(
        AF.createNamedExpression(DF.namedNode('s'), [
          AF.createTermExpression(DF.variable('a')),
          AF.createTermExpression(DF.namedNode('b')),
          AF.createTermExpression(DF.variable('a')),
        ]),
      )).toEqual([ DF.variable('a') ]);
    });

    it('returns a variable for a term expression with a variable', async() => {
      expect(getExpressionVariables(
        AF.createTermExpression(DF.variable('s')),
      )).toEqual([ DF.variable('s') ]);
    });

    it('returns an empty array for a term expression with a named node', async() => {
      expect(getExpressionVariables(
        AF.createTermExpression(DF.namedNode('s')),
      )).toEqual([]);
    });

    it('returns for an operator expression with variables', async() => {
      expect(getExpressionVariables(
        AF.createOperatorExpression('+', [
          AF.createTermExpression(DF.variable('a')),
          AF.createTermExpression(DF.variable('b')),
        ]),
      )).toEqual([ DF.variable('a'), DF.variable('b') ]);
    });

    it('returns for an operator expression with duplicate variables', async() => {
      expect(getExpressionVariables(
        AF.createOperatorExpression('+', [
          AF.createTermExpression(DF.variable('a')),
          AF.createTermExpression(DF.variable('a')),
        ]),
      )).toEqual([ DF.variable('a') ]);
    });

    it('returns for a nested operator expression with variables', async() => {
      expect(getExpressionVariables(
        AF.createOperatorExpression('+', [
          AF.createTermExpression(DF.variable('a')),
          AF.createOperatorExpression('+', [
            AF.createTermExpression(DF.variable('b')),
            AF.createTermExpression(DF.variable('c')),
          ]),
        ]),
      )).toEqual([ DF.variable('a'), DF.variable('b'), DF.variable('c') ]);
    });

    it('returns for a nested operator expression with mixed terms', async() => {
      expect(getExpressionVariables(
        AF.createOperatorExpression('+', [
          AF.createTermExpression(DF.blankNode('a')),
          AF.createOperatorExpression('+', [
            AF.createTermExpression(DF.namedNode('b')),
            AF.createTermExpression(DF.variable('c')),
          ]),
        ]),
      )).toEqual([ DF.variable('c') ]);
    });
  });
});
