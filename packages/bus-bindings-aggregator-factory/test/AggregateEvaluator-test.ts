import type { ComunicaDataFactory, IExpressionEvaluator } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import * as Eval from '@comunica/utils-expression-evaluator';
import {
  getMockEEActionContext,
  getMockEEFactory,
  termInt,
  makeAggregate,
} from '@comunica/utils-jest';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { AggregateEvaluator } from '../lib';

const DF = <ComunicaDataFactory> new DataFactory();
const BF = new BindingsFactory(DF);

class EmptyEvaluator extends AggregateEvaluator {
  public constructor(evaluator: IExpressionEvaluator, distinct: boolean, throwError = false) {
    super(evaluator, distinct, throwError);
  }

  public putTerm(_: RDF.Term): void {
    // Empty
  }

  protected termResult(): RDF.Term | undefined {
    return undefined;
  }
}

class LastTermEvaluator extends AggregateEvaluator {
  private lastTerm: RDF.Term | undefined;

  public constructor(evaluator: IExpressionEvaluator, distinct: boolean, throwError = false) {
    super(evaluator, distinct, throwError);
  }

  public putTerm(term: RDF.Term): void {
    this.lastTerm = term;
  }

  protected termResult(): RDF.Term | undefined {
    return this.lastTerm;
  }
}

describe('aggregate evaluator', () => {
  it('handles errors using async evaluations', async() => {
    const temp = await getMockEEFactory().run({
      algExpr: makeAggregate('sum').expression,
      context: getMockEEActionContext(),
    }, undefined);
    let first = true;
    temp.evaluate = async() => {
      if (first) {
        first = false;
        throw new Error('We only want the first to succeed');
      }
      return termInt('1');
    };
    const evaluator: AggregateEvaluator = new EmptyEvaluator(temp, false);
    await Promise.all([ evaluator.putBindings(BF.bindings()), evaluator.putBindings(BF.bindings()) ]);
    await expect(evaluator.result()).resolves.toBeUndefined();
  });

  it('should ignore unbound variable errors', async() => {
    const temp = await getMockEEFactory().run({
      algExpr: makeAggregate('sum').expression,
      context: getMockEEActionContext(),
    }, undefined);
    let first = true;
    temp.evaluate = async(bindings) => {
      if (first) {
        first = false;
        throw new Eval.UnboundVariableError('?a', bindings);
      }
      return termInt('1');
    };
    const evaluator: AggregateEvaluator = new LastTermEvaluator(temp, false, true);

    await expect(evaluator.putBindings(BF.bindings())).resolves.toBeUndefined();
    await expect(evaluator.putBindings(BF.bindings([
      [ DF.variable('a'), DF.literal('1') ],
    ]))).resolves.toBeUndefined();
    await expect(evaluator.result()).resolves.toEqual(termInt('1'));
  });
});
