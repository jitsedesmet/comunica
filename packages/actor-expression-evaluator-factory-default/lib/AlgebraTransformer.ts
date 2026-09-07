import type { MediatorFunctionFactory } from '@comunica/bus-function-factory';
import { KeysExpressionEvaluator } from '@comunica/context-entries';
import type { Expression, IActionContext, OperatorExpression } from '@comunica/types';
import { Algebra, AlgebraFactory, algebraUtils, isKnownSubType } from '@comunica/utils-algebra';
import * as ExprEval from '@comunica/utils-expression-evaluator';

export class AlgebraTransformer extends ExprEval.TermTransformer {
  private readonly AF = new AlgebraFactory();
  public constructor(
    private readonly context: IActionContext,
    private readonly mediatorFunctionFactory: MediatorFunctionFactory,
  ) {
    super(context.getSafe(KeysExpressionEvaluator.superTypeProvider));
  }

  public async transformAlgebra(expr: Algebra.Expression): Promise<Expression> {
    return <Expression> <unknown> await algebraUtils.mapOperationSubAsync(expr, {
      // Operator and named expressions are handled per type rather than per subType, because only a
      // type-level callback is handed the expression as it was before its arguments were converted,
      // and the function factory resolves the function from those arguments as algebra.
      [Algebra.Types.EXPRESSION]: {
        transform: (copy, orig) => {
          // The traversal already converted the arguments, in place on the copy.
          const args = <Expression[]> <unknown> (<Algebra.OperatorExpression> <unknown> copy).args;
          if (isKnownSubType(orig, Algebra.ExpressionTypes.OPERATOR)) {
            return this.buildOperator(orig.operator.toLowerCase(), orig, args);
          }
          if (isKnownSubType(orig, Algebra.ExpressionTypes.NAMED)) {
            return this.buildOperator(orig.name.value, orig, args);
          }
          throw new Error(`Expression of type ${orig.subType} cannot be converted into internal representation of expression.`);
        },
      },
    }, {
      [Algebra.Types.EXPRESSION]: {
        [Algebra.ExpressionTypes.TERM]: { transform: term => this.transformTermExpression(term) },
        [Algebra.ExpressionTypes.EXISTENCE]: {
          // The pattern of an existence expression stays algebra: it is materialized and evaluated as a
          // query later on, so it must be neither converted nor copied.
          preVisitor: () => ({ continue: false, copy: false }),
          transform: existence => AlgebraTransformer.transformExistence(existence),
        },
        [Algebra.ExpressionTypes.AGGREGATE]: {
          // An aggregate expression stays algebra as well: the aggregator factory receives it as such.
          preVisitor: () => ({ continue: false, copy: false }),
          transform: aggregate => AlgebraTransformer.transformAggregate(aggregate),
        },
        [Algebra.ExpressionTypes.WILDCARD]: {
          transform: wildcard => AlgebraTransformer.transformWildcard(wildcard),
        },
      },
    });
  }

  private static transformWildcard(_term: Algebra.WildcardExpression): Expression {
    return new ExprEval.NamedNode('*');
  }

  private async transformTermExpression(expr: Algebra.TermExpression): Promise<Expression> {
    // A triple term is actually not a term since it itself can contain
    // variables thereby having the properties of an operator, we therefore map it to the triple operator here.
    // Not that this is needed because the EE has a shortcut for terms and sees them as distinct from operators.
    if (expr.term.termType === 'Quad') {
      const args = [
        this.AF.createTermExpression(expr.term.subject),
        this.AF.createTermExpression(expr.term.predicate),
        this.AF.createTermExpression(expr.term.object),
      ];
      return this.buildOperator(
        'triple',
        this.AF.createOperatorExpression('triple', args),
        await Promise.all(args.map(arg => this.transformAlgebra(arg))),
      );
    }
    return this.transformTerm(expr);
  }

  /**
   * Build the internal operator for the given expression, given its already converted arguments.
   * @param operator The name the function is resolved by.
   * @param expr The expression as algebra, which the function is resolved from.
   * @param operatorArgs The converted arguments of the expression.
   */
  private async buildOperator(
    operator: string,
    expr: Algebra.OperatorExpression | Algebra.NamedExpression,
    operatorArgs: Expression[],
  ): Promise<OperatorExpression> {
    const operatorFunc = await this.mediatorFunctionFactory.mediate({
      functionName: operator,
      arguments: expr.args,
      context: this.context,
    });
    if (!operatorFunc.checkArity(operatorArgs)) {
      throw new ExprEval.InvalidArity(operatorArgs, operator);
    }
    return new ExprEval.Operator(operator, operatorArgs, operatorFunc.apply);
  }

  public static transformAggregate(expr: Algebra.AggregateExpression): ExprEval.Aggregate {
    const name = expr.aggregator;
    return new ExprEval.Aggregate(name, expr);
  }

  public static transformExistence(expr: Algebra.ExistenceExpression): ExprEval.Existence {
    return new ExprEval.Existence(expr);
  }
}
