import { TermFunctionBase } from '@comunica/bus-function-factory';
import type {
  NumericLiteral,
  Term,
} from '@comunica/utils-expression-evaluator';
import {
  CastError,
  collapseWhitespace,
  decimal,
  declare,
  numericToDecimal,
  parseXSDDecimal,
  TypeURL,
} from '@comunica/utils-expression-evaluator';

export class TermFunctionXsdToDecimal extends TermFunctionBase {
  public constructor() {
    super({
      arity: 1,
      operator: TypeURL.XSD_DECIMAL,
      overloads: declare(TypeURL.XSD_DECIMAL)
        // https://www.w3.org/TR/xpath-functions-31/#casting-to-decimal
        .onNumeric1(() => (val: NumericLiteral) => {
          const result = numericToDecimal(val);
          if (result === undefined) {
            throw new CastError(val, TypeURL.XSD_DECIMAL);
          }
          return decimal(result);
        })
        .onString1(() => (val: Term) => {
          const result = parseXSDDecimal(collapseWhitespace(val.str()));
          if (result === undefined) {
            throw new CastError(val, TypeURL.XSD_DECIMAL);
          }
          return decimal(result);
        }, false)
        .onBoolean1Typed(() => val => decimal(val ? 1 : 0))
        .collect(),
    });
  }
}
