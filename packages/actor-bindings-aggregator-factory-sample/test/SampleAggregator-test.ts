import type { IBindingsAggregator } from '@comunica/bus-bindings-aggregator-factory';
import type { ActorExpressionEvaluatorFactory } from '@comunica/bus-expression-evaluator-factory';
import type { IActionContext } from '@comunica/types';
import { BF, DF, getMockEEActionContext, getMockEEFactory, intLiteral, makeAggregate } from '@comunica/utils-jest';
import type * as RDF from '@rdfjs/types';
import { SampleAggregator } from '../lib';

async function runAggregator(aggregator: IBindingsAggregator, input: RDF.Bindings[]): Promise<RDF.Term | undefined> {
  for (const bindings of input) {
    await aggregator.putBindings(bindings);
  }
  return aggregator.result();
}

async function createAggregator({ expressionEvaluatorFactory, context, distinct }: {
  expressionEvaluatorFactory: ActorExpressionEvaluatorFactory;
  context: IActionContext;
  distinct: boolean;
}): Promise<SampleAggregator> {
  return new SampleAggregator(
    await expressionEvaluatorFactory.run({
      algExpr: makeAggregate('sample', distinct).expression,
      context,
    }, undefined),
    distinct,
  );
}
describe('SampleAggregator', () => {
  let expressionEvaluatorFactory: ActorExpressionEvaluatorFactory;
  let context: IActionContext;

  beforeEach(() => {
    expressionEvaluatorFactory = getMockEEFactory();

    context = getMockEEActionContext();
  });

  describe('non distinctive sample', () => {
    let aggregator: IBindingsAggregator;

    beforeEach(async() => {
      aggregator = await createAggregator({ expressionEvaluatorFactory, context, distinct: false });
    });

    it('a list of bindings', async() => {
      const input = [
        BF.bindings([[ DF.variable('x'), intLiteral('1') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('2') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('3') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('4') ]]),
      ];

      await expect(runAggregator(aggregator, input)).resolves.toEqual(intLiteral('1'));
    });

    it('with respect to empty input', async() => {
      await expect(runAggregator(aggregator, [])).resolves.toBeUndefined();
    });
  });

  describe('distinctive sample', () => {
    let aggregator: IBindingsAggregator;

    beforeEach(async() => {
      aggregator = await createAggregator({ expressionEvaluatorFactory, context, distinct: true });
    });

    it('a list of bindings', async() => {
      const input = [
        BF.bindings([[ DF.variable('x'), intLiteral('1') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('2') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('1') ]]),
        BF.bindings([[ DF.variable('x'), intLiteral('1') ], [ DF.variable('y'), intLiteral('1') ]]),
      ];

      await expect(runAggregator(aggregator, input)).resolves.toEqual(intLiteral('1'));
    });

    it('with respect to empty input', async() => {
      await expect(runAggregator(aggregator, [])).resolves.toBeUndefined();
    });
  });
});
