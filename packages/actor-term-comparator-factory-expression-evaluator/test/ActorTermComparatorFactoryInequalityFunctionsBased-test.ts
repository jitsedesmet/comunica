import { createFuncMediator } from '@comunica/actor-function-factory-wrapper-all/test/util';
import { ActionContext, Bus } from '@comunica/core';
import {
  getMockEEActionContext,
  getMockMediatorMergeBindingsContext,
  getMockMediatorQueryOperation,
} from '@comunica/jest';
import {
  ActorTermComparatorFactoryExpressionEvaluator,
} from '../lib';

describe('ActorTermComparatorFactoryExpressionEvaluator', () => {
  let bus: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('An ActorTermComparatorFactoryExpressionEvaluator instance', () => {
    let actor: ActorTermComparatorFactoryExpressionEvaluator;

    beforeEach(() => {
      actor = new ActorTermComparatorFactoryExpressionEvaluator({
        name: 'actor',
        bus,
        mediatorFunctionFactory: createFuncMediator(),
        mediatorQueryOperation: getMockMediatorQueryOperation(),
        mediatorMergeBindingsContext: getMockMediatorMergeBindingsContext(),
      });
    });

    it('should test', async() => {
      await expect(actor.test({ context: new ActionContext() })).resolves.toBe(true);
    });

    it('should run', async() => {
      await expect(actor.run({ context: getMockEEActionContext() })).resolves.toMatchObject({
        orderTypes: expect.any(Function),
      });
    });
  });
});
