import { ActorFunctionFactoryTermAddition } from '@comunica/actor-function-factory-term-addition';
import type { IBindingsAggregator } from '@comunica/bus-bindings-aggregator-factory';
import type { ActorExpressionEvaluatorFactory } from '@comunica/bus-expression-evaluator-factory';
import type { MediatorFunctionFactory } from '@comunica/bus-function-factory';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActionContext } from '@comunica/types';
import { SparqlOperator } from '@comunica/utils-expression-evaluator';
import {
  createFuncMediator,
  BF,
  decimalLiteral,
  DF,
  floatLiteral,
  getMockEEActionContext,
  getMockEEFactory,
  intLiteral,
  makeAggregate,
  nonLiteral,
} from '@comunica/utils-jest';
import type * as RDF from '@rdfjs/types';
import { SumAggregator } from '../lib';

async function runAggregator(aggregator: IBindingsAggregator, input: RDF.Bindings[]): Promise<RDF.Term | undefined> {
  for (const bindings of input) {
    await aggregator.putBindings(bindings);
  }
  return aggregator.result();
}

async function createAggregator({ expressionEvaluatorFactory, mediatorFunctionFactory, context, distinct }: {
  expressionEvaluatorFactory: ActorExpressionEvaluatorFactory;
  mediatorFunctionFactory: MediatorFunctionFactory;
  context: IActionContext;
  distinct: boolean;
}): Promise<SumAggregator> {
  return new SumAggregator(
    await expressionEvaluatorFactory.run({
      algExpr: makeAggregate('sum', distinct).expression,
      context,
    }, undefined),
    distinct,
    context.getSafe(KeysInitQuery.dataFactory),
    await mediatorFunctionFactory.mediate({
      context,
      functionName: SparqlOperator.ADDITION,
      requireTermExpression: true,
    }),
  );
}

describe('SumAggregator', () => {
  let expressionEvaluatorFactory: ActorExpressionEvaluatorFactory;
  let mediatorFunctionFactory: MediatorFunctionFactory;
  let context: IActionContext;

  beforeEach(() => {
    expressionEvaluatorFactory = getMockEEFactory();
    mediatorFunctionFactory = createFuncMediator([
      args => new ActorFunctionFactoryTermAddition(args),
    ], {});

    context = getMockEEActionContext();
  });

  describe('non distinctive sum', () => {
    let aggregator: IBindingsAggregator;

    beforeEach(async() => {
      aggregator = await createAggregator({
        expressionEvaluatorFactory,
        mediatorFunctionFactory,
        context,
        distinct: false,
      });
    });

    it('a list of bindings', async() => {
      const input = [
        BF.bindings([[ DF.variable('x'), intLiteral('1') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('2') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('3') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('4') ]]),
      ];

      await expect(runAggregator(aggregator, input)).resolves.toEqual(intLiteral('10'));
    });

    it('undefined when sum is undefined', async() => {
      const input = [
        BF.bindings([[ DF.variable('x'), intLiteral('1') ]]),
        BF.bindings([[ DF.variable('x'), DF.literal('1') ]]),
      ];

      await expect(runAggregator(aggregator, input)).resolves.toBeUndefined();
    });

    it('with respect to type promotion', async() => {
      const input = [
        BF.bindings([[ DF.variable('x'), DF.literal('1', DF.namedNode('http://www.w3.org/2001/XMLSchema#byte')) ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('2') ]]),
        BF.bindings([[ DF.variable('x'), floatLiteral('3') ]]),
        BF.bindings([[ DF.variable('x'), DF.literal('4', DF.namedNode('http://www.w3.org/2001/XMLSchema#nonNegativeInteger')) ]]),
      ];
      await expect(runAggregator(aggregator, input)).resolves.toEqual(floatLiteral('10'));
    });

    it('with accurate results', async() => {
      const input = [
        BF.bindings([[ DF.variable('x'), decimalLiteral('1.0') ]]),
        BF.bindings([[ DF.variable('x'), decimalLiteral('2.2') ]]),
        BF.bindings([[ DF.variable('x'), decimalLiteral('2.2') ]]),
        BF.bindings([[ DF.variable('x'), decimalLiteral('2.2') ]]),
        BF.bindings([[ DF.variable('x'), decimalLiteral('3.5') ]]),
      ];
      await expect(runAggregator(aggregator, input)).resolves.toEqual(decimalLiteral('11.1'));
    });

    it('passing a non-literal should not be accepted', async() => {
      const input = [
        BF.bindings([[ DF.variable('x'), nonLiteral() ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('2') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('3') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('4') ]]),
      ];

      await expect(runAggregator(aggregator, input)).resolves.toBeUndefined();
    });

    it('with respect to empty input', async() => {
      await expect(runAggregator(aggregator, [])).resolves.toEqual(intLiteral('0'));
    });
  });

  describe('distinctive sum', () => {
    let aggregator: IBindingsAggregator;

    beforeEach(async() => {
      aggregator = await createAggregator({
        expressionEvaluatorFactory,
        mediatorFunctionFactory,
        context,
        distinct: true,
      });
    });

    it('a list of bindings', async() => {
      const input = [
        BF.bindings([[ DF.variable('x'), intLiteral('1') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('2') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('1') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('1') ], [ DF.variable('y'), intLiteral('1') ]]),
      ];

      await expect(runAggregator(aggregator, input)).resolves.toEqual(intLiteral('3'));
    });

    it('with respect to empty input', async() => {
      await expect(runAggregator(aggregator, [])).resolves.toEqual(intLiteral('0'));
    });
  });
});
