import { TermFunctionBase } from '@comunica/bus-function-factory';
import type {
  NumericLiteral,
  Term,
} from '@comunica/utils-expression-evaluator';
import {
  CastError,
  collapseWhitespace,
  declare,
  double,
  parseXSDDouble,
  TypeURL,
} from '@comunica/utils-expression-evaluator';

export class TermFunctionXsdToDouble extends TermFunctionBase {
  public constructor() {
    super({
      arity: 1,
      operator: TypeURL.XSD_DOUBLE,
      overloads: declare(TypeURL.XSD_DOUBLE)
        // https://www.w3.org/TR/xpath-functions-31/#casting-to-double
        .onNumeric1(() => (val: NumericLiteral) => double(val.toNumber()))
        .onBoolean1Typed(() => val => double(val ? 1 : 0))
        .onUnary(TypeURL.XSD_STRING, () => (val: Term) => {
          const result = parseXSDDouble(collapseWhitespace(val.str()));
          if (result === undefined) {
            throw new CastError(val, TypeURL.XSD_DOUBLE);
          }
          return double(result);
        }, false)
        .collect(),
    });
  }
}
