import { TermFunctionBase } from '@comunica/bus-function-factory';
import type { BigNumber } from '@comunica/utils-expression-evaluator';
import {
  decimal,
  declare,
  ExpressionError,
  SparqlOperator,
  TypeURL,
} from '@comunica/utils-expression-evaluator';

export class TermFunctionDivision extends TermFunctionBase {
  public constructor() {
    super({
      arity: 2,
      operator: SparqlOperator.DIVISION,
      overloads: declare(SparqlOperator.DIVISION)
        // https://www.w3.org/TR/xpath-functions/#func-numeric-divide
        // Decimal division by zero raises an error, while float and double division follow IEEE 754.
        .arithmetic(() => (left, right) => {
          if (right.isZero()) {
            throw new ExpressionError('Decimal division by 0');
          }
          return left.div(right);
        }, () => (left, right) => left / right)
        // Division of two integers results in a decimal.
        .onBinaryTyped(
          [ TypeURL.XSD_INTEGER, TypeURL.XSD_INTEGER ],
          () => (left: BigNumber, right: BigNumber) => {
            if (right.isZero()) {
              throw new ExpressionError('Integer division by 0');
            }
            return decimal(left.div(right));
          },
        )
        .collect(),
    });
  }
}
