import { AlgebraFactory } from '@comunica/utils-algebra';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { getMockInternalEvaluator } from '@comunica/utils-jest';
import { DataFactory } from 'rdf-data-factory';
import * as E from '../../../lib/expressions';
import { BigNumber } from '../../../lib/util/BigNumber';
import * as Err from '../../../lib/util/Errors';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);
const AF = new AlgebraFactory(DF);

describe('recursive evaluators', () => {
  describe('AsyncRecursiveEvaluator', () => {
    const evaluator = getMockInternalEvaluator();

    it('is able to evaluate operator', async() => {
      const one = new E.IntegerLiteral(new BigNumber(1));
      await expect(evaluator.evaluatorExpressionEvaluation(one, BF.bindings())).resolves
        .toEqual(new E.IntegerLiteral(new BigNumber(1)));
    });

    it('is not able to evaluate aggregates by default', async() => {
      await expect(evaluator.evaluatorExpressionEvaluation(new E.Aggregate('count', AF.createAggregateExpression(
        'count',
        AF.createWildcardExpression(),
        false,
      )), BF.bindings())).rejects.toThrow(Err.NoAggregator);
    });
  });
});
