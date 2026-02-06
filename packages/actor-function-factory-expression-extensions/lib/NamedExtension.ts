import { ExpressionFunctionBase } from '@comunica/bus-function-factory/lib/implementation/Core';
import { KeysExpressionEvaluator, KeysInitQuery } from '@comunica/context-entries';
import type { AsyncExtensionFunction, IEvalContext, TermExpression } from '@comunica/types';
import {
  ExtensionFunctionError,
  InvalidLiteralBoundBehavior,
  TermTransformer,
} from '@comunica/utils-expression-evaluator';

interface NamedExtensionArgs {
  operator: string;
  functionDefinition: AsyncExtensionFunction;
}

export class NamedExtension extends ExpressionFunctionBase {
  public constructor({ operator, functionDefinition }: NamedExtensionArgs) {
    super({
      arity: Number.POSITIVE_INFINITY,
      operator,
      apply: async({ args, exprEval, mapping }: IEvalContext): Promise<TermExpression> => {
        const evaluatedArgs: TermExpression[] = await Promise.all(args.map(arg =>
          exprEval.evaluatorExpressionEvaluation(arg, mapping)));
        try {
          const boundBehavior = exprEval.context.get(KeysExpressionEvaluator.invalidLiteralBoundBehavior) === 'error' ?
            InvalidLiteralBoundBehavior.ERROR :
            InvalidLiteralBoundBehavior.IGNORE;
          return new TermTransformer(
            exprEval.context.getSafe(KeysExpressionEvaluator.superTypeProvider),
            boundBehavior,
          )
            .transformRDFTermUnsafe(
              await functionDefinition(evaluatedArgs.map(term =>
                term.toRDF(exprEval.context.getSafe(KeysInitQuery.dataFactory)))),
            );
        } catch (error: unknown) {
          throw new ExtensionFunctionError(this.operator, error);
        }
      }
      ,
    });
  }
}
