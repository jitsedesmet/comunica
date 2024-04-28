import { createTermCompMediator } from '@comunica/actor-term-comparator-factory-inequality-functions-based/test/util';
import type { MediatorExpressionEvaluatorFactory } from '@comunica/bus-expression-evaluator-factory';
import type { MediatorTermComparatorFactory } from '@comunica/bus-term-comparator-factory';
import { ActionContext, Bus } from '@comunica/core';
import {
  BF,
  DF,
  getMockMediatorExpressionEvaluatorFactory,
  makeAggregate,
} from '@comunica/jest';
import { ArrayIterator } from 'asynciterator';
import { ActorBindingsAggregatorFactoryMin } from '../lib';

describe('ActorBindingsAggregatorFactoryMin', () => {
  let bus: any;
  let mediatorExpressionEvaluatorFactory: MediatorExpressionEvaluatorFactory;
  let mediatorTermComparatorFactory: MediatorTermComparatorFactory;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });

    const mediatorQueryOperation: any = {
      mediate: (arg: any) => Promise.resolve({
        bindingsStream: new ArrayIterator([
          BF.bindings([[ DF.variable('x'), DF.literal('1') ]]),
          BF.bindings([[ DF.variable('x'), DF.literal('2') ]]),
          BF.bindings([[ DF.variable('x'), DF.literal('3') ]]),
        ], { autoStart: false }),
        metadata: () => Promise.resolve({ cardinality: 3, canContainUndefs: false, variables: [ DF.variable('x') ]}),
        operated: arg,
        type: 'bindings',
      }),
    };

    mediatorExpressionEvaluatorFactory = getMockMediatorExpressionEvaluatorFactory({
      mediatorQueryOperation,
    });
    mediatorTermComparatorFactory = createTermCompMediator();
  });

  describe('An ActorBindingsAggregatorFactoryMin instance', () => {
    let actor: ActorBindingsAggregatorFactoryMin;

    beforeEach(() => {
      actor = new ActorBindingsAggregatorFactoryMin({
        name: 'actor',
        bus,
        mediatorExpressionEvaluatorFactory,
        mediatorTermComparatorFactory,
      });
    });

    describe('test', () => {
      it('accepts min 1', () => {
        return expect(actor.test({
          context: new ActionContext(),
          expr: makeAggregate('min', false),
        })).resolves.toEqual({});
      });

      it('accepts min 2', () => {
        return expect(actor.test({
          context: new ActionContext(),
          expr: makeAggregate('min', true),
        })).resolves.toEqual({});
      });

      it('rejects sum', () => {
        return expect(actor.test({
          context: new ActionContext(),
          expr: makeAggregate('sum', false),
        })).rejects.toThrow();
      });
    });

    it('should run', () => {
      return expect(actor.run({
        context: new ActionContext(),
        expr: makeAggregate('min', false),
      })).resolves.toMatchObject({});
    });
  });
});