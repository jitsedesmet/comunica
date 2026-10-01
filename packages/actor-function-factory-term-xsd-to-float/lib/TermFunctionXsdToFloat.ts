import { TermFunctionBase } from '@comunica/bus-function-factory';
import type {
  NumericLiteral,
  StringLiteral,
} from '@comunica/utils-expression-evaluator';
import {
  CastError,
  collapseWhitespace,
  declare,
  float,
  numericToFloat,
  parseXSDFloat,
  TypeURL,
} from '@comunica/utils-expression-evaluator';

export class TermFunctionXsdToFloat extends TermFunctionBase {
  public constructor() {
    super({
      arity: 1,
      operator: TypeURL.XSD_FLOAT,
      overloads: declare(TypeURL.XSD_FLOAT)
        // https://www.w3.org/TR/xpath-functions-31/#casting-to-float
        .onNumeric1(() => (val: NumericLiteral) => float(numericToFloat(val)))
        .onBoolean1Typed(() => val => float(val ? 1 : 0))
        .onUnary(TypeURL.XSD_STRING, () => (val: StringLiteral) => {
          const result = parseXSDFloat(collapseWhitespace(val.str()));
          if (result === undefined) {
            throw new CastError(val, TypeURL.XSD_FLOAT);
          }
          return float(result);
        }, false)
        .collect(),
    });
  }
}
