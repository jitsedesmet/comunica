import { getMockExpression } from '@comunica/expression-evaluator/test/util/utils';
import { getMockEEActionContext, getMockEEFactory } from '@comunica/jest';
import type { ActorExpressionEvaluatorFactoryDefault } from '../lib';

describe('ActorExpressionEvaluatorFactoryDefault', () => {
  describe('An ActorExpressionEvaluatorFactoryDefault instance', () => {
    let actor: ActorExpressionEvaluatorFactoryDefault;

    beforeEach(() => {
      actor = getMockEEFactory();
    });

    it('should test', async() => {
      await expect(actor.test({
        context: getMockEEActionContext(),
        algExpr: getMockExpression('1'),
      })).resolves.toBe(true);
    });

    it('should run', async() => {
      await expect(actor.run({
        context: getMockEEActionContext(),
        algExpr: getMockExpression('1'),
      })).resolves.toMatchObject({});
    });
  });
});
