import { TermFunctionBase } from '@comunica/bus-function-factory';
import {
  BigNumber,
  CastError,
  declare,
  integer,
  numericToDecimal,
  parseXSDInteger,
  TypeURL,
} from '@comunica/utils-expression-evaluator';
import type {
  NumericLiteral,
  Term,
} from '@comunica/utils-expression-evaluator';

export class TermFunctionXsdToInteger extends TermFunctionBase {
  public constructor() {
    super({
      arity: 1,
      operator: TypeURL.XSD_INTEGER,
      overloads: declare(TypeURL.XSD_INTEGER)
        .onBoolean1Typed(() => val => integer(val ? 1 : 0))
        .onNumeric1(() => (val: NumericLiteral) => {
          const result = numericToDecimal(val);
          if (result === undefined) {
            throw new CastError(val, TypeURL.XSD_INTEGER);
          }
          // Casting to an integer truncates the fractional part.
          return integer(result.integerValue(BigNumber.ROUND_DOWN));
        })
        .onString1(() => (val: Term) => {
          const result = parseXSDInteger(val.str());
          if (result === undefined) {
            throw new CastError(val, TypeURL.XSD_INTEGER);
          }
          return integer(result);
        })
        .collect(),
    });
  }
}
