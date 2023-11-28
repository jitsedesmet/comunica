import type { MediatorQueryOperation } from '@comunica/bus-query-operation';
import { ActorQueryOperation, materializeOperation } from '@comunica/bus-query-operation';
import { KeysExpressionEvaluator } from '@comunica/context-entries';
import type { IActionContext } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import * as E from '../expressions';
import { expressionToVar } from '../functions/Helpers';
import { AlgebraTransformer } from '../transformers/AlgebraTransformer';
import * as Err from '../util/Errors';

export type AsyncExtensionFunction = (args: RDF.Term[]) => Promise<RDF.Term>;
export type AsyncExtensionFunctionCreator = (functionNamedNode: RDF.NamedNode) =>
Promise<AsyncExtensionFunction | undefined>;

/**
 * This class provides evaluation functionality to already transformed expressions.
 */
export class InternalEvaluator {
  public readonly transformer: AlgebraTransformer;

  private readonly subEvaluators: Record<E.ExpressionType,
  (expr: E.Expression, mapping: RDF.Bindings) => Promise<E.Term> | E.Term> =
      {
        [E.ExpressionType.Term]: this.term.bind(this),
        [E.ExpressionType.Variable]: this.variable.bind(this),
        [E.ExpressionType.Operator]: this.evalFunction.bind(this),
        [E.ExpressionType.SpecialOperator]: this.evalFunction.bind(this),
        [E.ExpressionType.Named]: this.evalFunction.bind(this),
        [E.ExpressionType.Existence]: this.evalExistence.bind(this),
        [E.ExpressionType.Aggregate]: this.evalAggregate.bind(this),
      };

  public constructor(public readonly context: IActionContext) {
    this.transformer = new AlgebraTransformer(
      context,
    );
  }

  public async internalEvaluation(expr: E.Expression, mapping: RDF.Bindings): Promise<E.Term> {
    const evaluator = this.subEvaluators[expr.expressionType];
    return evaluator.bind(this)(expr, mapping);
  }

  private term(expr: E.Term, _: RDF.Bindings): E.Term {
    return expr;
  }

  private variable(expr: E.Variable, mapping: RDF.Bindings): E.Term {
    const term = mapping.get(expressionToVar(expr));
    if (!term) {
      throw new Err.UnboundVariableError(expr.name, mapping);
    }
    return this.transformer.transformRDFTermUnsafe(term);
  }

  private async evalFunction(expr: E.Operator | E.SpecialOperator | E.Named, mapping: RDF.Bindings):
  Promise<E.Term> {
    return expr.apply({
      args: expr.args,
      mapping,
      exprEval: this,
    });
  }

  private async evalExistence(expr: E.Existence, mapping: RDF.Bindings): Promise<E.Term> {
    const operation = materializeOperation(expr.expression.input, mapping);

    const mediator: MediatorQueryOperation = this.context.getSafe(KeysExpressionEvaluator.mediatorQueryOperation);
    const outputRaw = await mediator.mediate({ operation, context: this.context });
    const output = ActorQueryOperation.getSafeBindings(outputRaw);

    return await new Promise(
      (resolve, reject) => {
        output.bindingsStream.on('end', () => {
          resolve(false);
        });

        output.bindingsStream.on('error', reject);

        output.bindingsStream.on('data', () => {
          output.bindingsStream.close();
          resolve(true);
        });
      },
    )
      .then((exists: boolean) => expr.expression.not ? !exists : exists)
      .then((exists: boolean) => new E.BooleanLiteral(exists));
  }

  private evalAggregate(): never {
    throw new Err.NoAggregator();
  }
}
