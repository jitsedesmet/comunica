import { TermFunctionBase } from '@comunica/bus-function-factory';
import type {
  DecimalLiteral,
  IntegerLiteral,
  StringLiteral,
  DoubleLiteral,
} from '@comunica/utils-expression-evaluator';
import {
  BigNumber,
  bool,
  decimal,
  declare,
  double,
  float,
  FloatLiteral,
  integer,
  string,
  TypeURL,
} from '@comunica/utils-expression-evaluator';

/**
 * Implementation of `xsd:string`, following the XPath specification:
 * https://www.w3.org/TR/xpath-functions/#casting-to-string
 */
export class TermFunctionXsdToString extends TermFunctionBase {
  public constructor() {
    super({
      arity: 1,
      operator: TypeURL.XSD_STRING,
      overloads: declare(TypeURL.XSD_STRING)
        // The numeric types (xsd:decimal, xsd:double, xsd:float), as well as xsd:integer,
        // are handled individually, covering all cases of .onNumeric1, based on `extensionTableInput`.
        // Specification treats floats the same as doubles, and thy share formatter code, as well.
        .set<DecimalLiteral>([ TypeURL.XSD_DECIMAL ], () => ([ val ]) =>
          TermFunctionXsdToString.castAsDecimal(val.typedValue))
        .set<IntegerLiteral>([ TypeURL.XSD_INTEGER ], () => ([ val ]) => TermFunctionXsdToString.castAsInteger(val))
        .set<DoubleLiteral>([ TypeURL.XSD_DOUBLE ], () => ([ val ]) => TermFunctionXsdToString.castAsDouble(val))
        .set<FloatLiteral>([ TypeURL.XSD_FLOAT ], () => ([ val ]) => TermFunctionXsdToString.castAsDouble(val))
        .onBoolean1Typed(() => val => string(bool(val).str()))
        .onTerm1(() => (val: StringLiteral) => string(val.str()))
        .collect(),
    });
  }

  private static castAsInteger(val: IntegerLiteral): StringLiteral {
    return string(integer(val.typedValue).str());
  }

  private static castAsDecimal(value: BigNumber): StringLiteral {
    // Specification requires integer-valued decimals to be cast as integers.
    return value.isInteger() ?
      string(integer(value).str()) :
      string(decimal(value).str());
  }

  private static castAsDouble(val: DoubleLiteral): StringLiteral {
    const value = val.typedValue;
    // Specification requires zero to be returned as "0" or "-0", which differs from canonical "0.0E0" or "-0.0E0"
    if (value === 0) {
      return string(Object.is(value, -0) ? '-0' : '0');
    }

    // The canonical representation is the shortest one that identifies the value,
    // which also handles NaN and infinities.
    const canonical = val instanceof FloatLiteral ? float(value).str() : double(value).str();

    // Values with an absolute value in range `[0.000001, 1000000[` should be converted to a decimal before casting to
    // string, as per the spec. The decimal bounds are promoted to the type of the value when comparing.
    const lowerBound = val instanceof FloatLiteral ? Math.fround(0.000_001) : 0.000_001;
    if (Math.abs(value) >= lowerBound && Math.abs(value) < 1_000_000) {
      return TermFunctionXsdToString.castAsDecimal(new BigNumber(canonical));
    }

    return string(canonical);
  }
}
