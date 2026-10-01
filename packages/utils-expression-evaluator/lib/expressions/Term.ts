import type {
  ComunicaDataFactory,
  IDateRepresentation,
  IDateTimeRepresentation,
  IDurationRepresentation,
  ISuperTypeProvider,
  ITimeRepresentation,
  IYearMonthDurationRepresentation,
  TermExpression,
  TermType,
} from '@comunica/types';
import { ExpressionType } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { BigNumber } from '../util/BigNumber';
import * as C from '../util/Consts';
import { TypeURL } from '../util/Consts';
import * as Err from '../util/Errors';
import { roundToFloat } from '../util/FloatingPoint';
import { serializeDate, serializeDateTime, serializeDuration, serializeTime } from '../util/Serialization';

export abstract class Term implements TermExpression {
  public expressionType: ExpressionType.Term = ExpressionType.Term;
  public abstract termType: TermType;

  public abstract toRDF(dataFactory: ComunicaDataFactory): RDF.Term;

  public str(): string {
    throw new Err.InvalidArgumentTypes([ this ], C.SparqlOperator.STR);
  }

  public coerceEBV(): boolean {
    throw new Err.EBVCoercionError(this);
  }
}

// NamedNodes -----------------------------------------------------------------
export class NamedNode extends Term {
  public termType: TermType = 'namedNode';
  public constructor(public value: string) {
    super();
  }

  public toRDF(dataFactory: ComunicaDataFactory): RDF.Term {
    return dataFactory.namedNode(this.value);
  }

  public override str(): string {
    return this.value;
  }
}

// BlankNodes -----------------------------------------------------------------

export class BlankNode extends Term {
  public value: RDF.BlankNode | string;
  public termType: TermType = 'blankNode';

  public constructor(value: RDF.BlankNode | string) {
    super();
    this.value = value;
  }

  public toRDF(dataFactory: ComunicaDataFactory): RDF.Term {
    return typeof this.value === 'string' ? dataFactory.blankNode(this.value) : this.value;
  }
}

// Quads -----------------------------------------------------------------
export class Quad extends Term {
  public termType: TermType = 'quad';

  public constructor(
    public readonly subject: Term,
    public readonly predicate: Term,
    public readonly object: Term,
    public readonly graph: Term,
  ) {
    super();
  }

  public toRDF(dataFactory: ComunicaDataFactory): RDF.BaseQuad {
    return dataFactory.quad(
      <RDF.Quad_Subject> this.subject.toRDF(dataFactory),
      <RDF.Quad_Predicate> this.predicate.toRDF(dataFactory),
      <RDF.Quad_Object> this.object.toRDF(dataFactory),
      <RDF.Quad_Graph> this.graph.toRDF(dataFactory),
    );
  }

  public override str(): string {
    return `Quad: [${this.subject.str()}, ${this.predicate.str()}, ${this.object.str()}, ${this.graph.str()}]`;
  }
}

export class DefaultGraph extends Term {
  public termType: TermType = 'defaultGraph';

  public constructor() {
    super();
  }

  public toRDF(dataFactory: ComunicaDataFactory): RDF.DefaultGraph {
    return dataFactory.defaultGraph();
  }

  public override str(): string {
    return 'DefaultGraph';
  }
}

// Literals-- -----------------------------------------------------------------
export function isLiteralTermExpression(expr: TermExpression): Literal<any> | undefined {
  if (expr.termType === 'literal') {
    return <Literal<any>> expr;
  }
  return undefined;
}

export interface ISerializable {
  toString: () => string;
}

export class Literal<T extends ISerializable> extends Term {
  public termType = <const> 'literal';
  /**
   * @param typedValue internal representation of this literal's value
   * @param dataType a string representing the datatype. Can be of type @see LiteralTypes or any URI
   * @param strValue the string value of this literal. In other words, the string representing the RDF.literal value.
   * @param language the language, mainly for language enabled strings like RDF_LANG_STRING
   * @param direction the base direction, mainly for directional language enabled strings like RDF_DIR_LANG_STRING
   */
  public constructor(
    public typedValue: T,
    public dataType: string,
    public strValue?: string,
    public language?: string,
    public direction?: 'ltr' | 'rtl',
  ) {
    super();
  }

  public toRDF(dataFactory: ComunicaDataFactory): RDF.Literal {
    return dataFactory.literal(
      this.strValue ?? this.str(),
      this.direction && this.language ?
          { language: this.language, direction: this.direction } :
        this.language ?? dataFactory.namedNode(this.dataType),
    );
  }

  public override str(): string {
    return this.strValue ?? this.typedValue.toString();
  }
}

/**
 * The internal representation of numeric values.
 *
 * Integers and decimals are unbounded in XSD (https://www.w3.org/TR/xmlschema-2/#decimal),
 * so they are represented as arbitrary-precision BigNumbers.
 * Doubles and floats are IEEE 754 floating point numbers,
 * so they are represented as (respectively 64-bit and 32-bit rounded) JS numbers.
 */
export type NumericValue = number | BigNumber;

const BIG_ZERO = new BigNumber(0);

/**
 * The value space of decimals (and integers) has no negative zero,
 * while BigNumbers do, so negative zero is normalized to (positive) zero.
 * @param value An arbitrary-precision number.
 */
function normalizeDecimal(value: BigNumber): BigNumber {
  return value.isZero() ? BIG_ZERO : value;
}

export abstract class NumericLiteral<T extends NumericValue = NumericValue> extends Literal<T> {
  protected abstract specificFormatter(val: T): string;

  public override coerceEBV(): boolean {
    // https://www.w3.org/TR/sparql11-query/#ebv: false if the numeric value is zero or NaN.
    const value: NumericValue = this.typedValue;
    return typeof value === 'number' ? Boolean(value) : !value.isZero();
  }

  public override toRDF(dataFactory: ComunicaDataFactory): RDF.Literal {
    const term = super.toRDF(dataFactory);
    const value: NumericValue = this.typedValue;
    if (typeof value === 'number' && !Number.isFinite(value)) {
      term.value = term.value.replace('Infinity', 'INF');
    }
    return term;
  }

  public override str(): string {
    return this.strValue ?? this.specificFormatter(this.typedValue);
  }

  /**
   * The numeric value of this literal as a JS number (a double), possibly losing precision.
   */
  public toNumber(): number {
    const value: NumericValue = this.typedValue;
    return typeof value === 'number' ? value : value.toNumber();
  }
}

/**
 * Integer datatype from XSD: https://www.w3.org/TR/xmlschema-2/#integer
 *
 * The canonical representation consists of a finite-length sequence of decimal digits (#x30-#x39),
 * with leading + and leading zeroes prohibited.
 *
 * Integers are unbounded, so the value is stored as an arbitrary-precision BigNumber.
 */
export class IntegerLiteral extends NumericLiteral<BigNumber> {
  public constructor(
    typedValue: BigNumber,
    dataType?: string,
    strValue?: string,
    language?: string,
  ) {
    super(normalizeDecimal(typedValue), dataType ?? TypeURL.XSD_INTEGER, strValue, language);
  }

  protected override specificFormatter(val: BigNumber): string {
    // Never use exponential notation, regardless of the size of the number.
    return val.toFixed(0);
  }
}

/**
 * Decimal datatype from XSD: https://www.w3.org/TR/xmlschema-2/#decimal
 *
 * The canonical representation consists of a finite-length sequence of decimal digits (#x30-#x39),
 * separated by a period as a decimal indicator. Leading + is prohibited. Leading and trailing zeroes
 * are prohibited, except for the single mandatory digit on both sides of the decimal point.
 *
 * Decimals are unbounded, so the value is stored as an arbitrary-precision BigNumber.
 */
export class DecimalLiteral extends NumericLiteral<BigNumber> {
  public constructor(
    typedValue: BigNumber,
    dataType?: string,
    strValue?: string,
    language?: string,
  ) {
    super(normalizeDecimal(typedValue), dataType ?? TypeURL.XSD_DECIMAL, strValue, language);
  }

  protected override specificFormatter(val: BigNumber): string {
    // Never use exponential notation, and do not include trailing zeroes.
    // eslint-disable-next-line unicorn/require-number-to-fixed-digits-argument -- BigNumber keeps all digits
    let str = val.toFixed();

    // Ensure there is at least one decimal place.
    if (!str.includes('.')) {
      str += '.0';
    }

    return str;
  }
}

/**
 * Double datatype from XSD: https://www.w3.org/TR/xmlschema-2/#double
 *
 * The canonical representation consists of a decimal mantissa, followed by E, followed by integer exponent.
 * The mantissa must follow canonical decimal format, and if zero, must be `0.0`.
 * The exponent must follow canonical integer format, and if zero, must be `0`.
 * The canonical representation of zero is `0.0E0`, and of negative zero is `-0.0E0`.
 *
 * Doubles are IEEE 754 double-precision 64-bit floating point numbers, just like JS numbers.
 */
export class DoubleLiteral extends NumericLiteral<number> {
  public constructor(
    typedValue: number,
    dataType?: string,
    strValue?: string,
    language?: string,
  ) {
    super(typedValue, dataType ?? TypeURL.XSD_DOUBLE, strValue, language);
  }

  protected override specificFormatter(val: number): string {
    if (Object.is(val, -0)) {
      // https://www.w3.org/TR/xmlschema11-2/#f-doubleCanmap
      return '-0.0E0';
    }
    if (Number.isFinite(val)) {
      return DoubleLiteral.formatExponential(val.toExponential());
    }

    if (val < 0) {
      return '-INF';
    }

    if (val > 0) {
      return 'INF';
    }

    return 'NaN';
  }

  /**
   * Convert the JS exponential notation (e.g. `1.1e+3`) to the canonical XSD notation (e.g. `1.1E3`).
   * @param exponential A finite number in JS exponential notation.
   */
  protected static formatExponential(exponential: string): string {
    let [ mantissa, exponent ] = exponential.split('e');

    // Remove leading + from the exponent
    if (exponent.startsWith('+')) {
      exponent = exponent.replace(/^\+/u, '');
    }

    // Make sure the mantissa has a decimal slot
    if (!mantissa.includes('.')) {
      mantissa += '.0';
    }

    return `${mantissa}E${exponent}`;
  }
}

/**
 * Float datatype from XSD: https://www.w3.org/TR/xmlschema-2/#float
 *
 * Floats are IEEE 754 single-precision 32-bit floating point numbers.
 * They are stored as JS numbers that are rounded to the nearest single-precision value.
 * The canonical representations of the XSD types are identical,
 * so the formatter implementation is mostly shared through inheritance.
 */
export class FloatLiteral extends DoubleLiteral {
  public constructor(
    typedValue: number,
    dataType?: string,
    strValue?: string,
    language?: string,
  ) {
    super(Math.fround(typedValue), dataType ?? TypeURL.XSD_FLOAT, strValue, language);
  }

  protected override specificFormatter(val: number): string {
    if (Number.isFinite(val) && val !== 0) {
      // Use the shortest representation that uniquely identifies the single-precision value,
      // e.g. `1.0E-1` instead of `1.0000000149011612E-1` for the float closest to 0.1.
      for (let digits = 1; digits < 9; digits++) {
        const exponential = val.toExponential(digits - 1);
        if (roundToFloat(new BigNumber(exponential)) === val) {
          return DoubleLiteral.formatExponential(exponential);
        }
      }
      return DoubleLiteral.formatExponential(val.toExponential(8));
    }
    return super.specificFormatter(val);
  }
}

export class BooleanLiteral extends Literal<boolean> {
  public constructor(public override typedValue: boolean, public override strValue?: string, dataType?: string) {
    super(typedValue, dataType ?? TypeURL.XSD_BOOLEAN, strValue);
  }

  public override coerceEBV(): boolean {
    return this.typedValue;
  }
}

export class LangStringLiteral extends Literal<string> {
  public constructor(public override typedValue: string, public override language: string, dataType?: string) {
    super(typedValue, dataType ?? TypeURL.RDF_LANG_STRING, typedValue, language);
  }

  public override coerceEBV(): boolean {
    // Throws in [SPARQL 1.2](https://www.w3.org/TR/sparql12-query/#ebv), and [1.1](https://www.w3.org/TR/sparql11-query/#ebv)
    return super.coerceEBV();
  }
}

export class DirLangStringLiteral extends Literal<string> {
  public constructor(
    public override typedValue: string,
    public override language: string,
    public override direction: 'ltr' | 'rtl',
    dataType?: string,
  ) {
    super(typedValue, dataType ?? TypeURL.RDF_DIR_LANG_STRING, typedValue, language, direction);
  }
}

// https://www.w3.org/TR/2004/REC-rdf-concepts-20040210/#dfn-plain-literal
// https://www.w3.org/TR/sparql11-query/#defn_SimpleLiteral
// https://www.w3.org/TR/sparql11-query/#func-strings
// This does not include language tagged literals
export class StringLiteral extends Literal<string> {
  /**
   * @param typedValue
   * @param dataType Should be type that implements XSD_STRING
   */
  public constructor(public override typedValue: string, dataType?: string) {
    super(typedValue, dataType ?? TypeURL.XSD_STRING, typedValue);
  }

  public override coerceEBV(): boolean {
    return this.str().length > 0;
  }
}

export class DateTimeLiteral extends Literal<IDateTimeRepresentation> {
  public constructor(
    public override typedValue: IDateTimeRepresentation,
    public override strValue?: string,
    dataType?: string,
  ) {
    super(typedValue, dataType ?? TypeURL.XSD_DATE_TIME, strValue);
  }

  public override str(): string {
    return serializeDateTime(this.typedValue);
  }
}

export class TimeLiteral extends Literal<ITimeRepresentation> {
  public constructor(
    public override typedValue: ITimeRepresentation,
    public override strValue?: string,
    dataType?: string,
  ) {
    super(typedValue, dataType ?? TypeURL.XSD_TIME, strValue);
  }

  public override str(): string {
    return serializeTime(this.typedValue);
  }
}

export class DateLiteral extends Literal<IDateRepresentation> {
  public constructor(
    public override typedValue: IDateRepresentation,
    public override strValue?: string,
    dataType?: string,
  ) {
    super(typedValue, dataType ?? TypeURL.XSD_DATE, strValue);
  }

  public override str(): string {
    return serializeDate(this.typedValue);
  }
}

export class DurationLiteral extends Literal<Partial<IDurationRepresentation>> {
  public constructor(
    public override typedValue: Partial<IDurationRepresentation>,
    public override strValue?: string,
    dataType?: string,
  ) {
    super(typedValue, dataType ?? TypeURL.XSD_DURATION, strValue);
  }

  public override str(): string {
    return serializeDuration(this.typedValue);
  }
}

export class DayTimeDurationLiteral extends DurationLiteral {
  public constructor(
    public override typedValue: Partial<IDurationRepresentation>,
    public override strValue?: string,
    dataType?: string,
  ) {
    super(typedValue, strValue, dataType ?? TypeURL.XSD_DAY_TIME_DURATION);
  }
}

export class YearMonthDurationLiteral extends Literal<Partial<IYearMonthDurationRepresentation>> {
  public constructor(
    public override typedValue: Partial<IYearMonthDurationRepresentation>,
    public override strValue?: string,
    dataType?: string,
  ) {
    super(typedValue, dataType ?? TypeURL.XSD_YEAR_MONTH_DURATION, strValue);
  }

  public override str(): string {
    return serializeDuration(this.typedValue, 'P0M');
  }
}

/**
 * This class is used when a literal is parsed, and it's value is
 * an invalid lexical form for it's datatype. The spec defines value with
 * invalid lexical form are still valid terms, and as such we can not error
 * immediately. This class makes sure that the typedValue will remain undefined,
 * and the category 'nonlexical'. This way, only when operators apply to the
 * 'nonlexical' category, they will keep working, otherwise they will throw a
 * type error.
 * This seems to match the spec, except maybe for functions that accept
 * non-lexical values for their datatype.
 *
 * See:
 *  - https://www.w3.org/TR/xquery/#dt-type-error
 *  - https://www.w3.org/TR/rdf-concepts/#section-Literal-Value
 *  - https://www.w3.org/TR/xquery/#dt-ebv
 *  - ... some other more precise thing i can't find...
 */
export class NonLexicalLiteral extends Literal<{ toString: () => 'undefined' }> {
  public constructor(
    typedValue: undefined,
    dataType: string,
    private readonly openWorldType: ISuperTypeProvider,
    strValue?: string,
    language?: string,
  ) {
    super({ toString: () => 'undefined' }, dataType, strValue, language);
  }

  public override coerceEBV(): boolean {
    // Always throws in [SPARQL 1.2](https://www.w3.org/TR/sparql12-query/#ebv),
    // and sometimes throws in [1.1](https://www.w3.org/TR/sparql11-query/#ebv)
    return super.coerceEBV();
  }

  public override toRDF(dataFactory: ComunicaDataFactory): RDF.Literal {
    return dataFactory.literal(
      this.str(),
      this.language ?? dataFactory.namedNode(this.dataType),
    );
  }

  public override str(): string {
    return this.strValue ?? '';
  }
}

export function isNonLexicalLiteral(lit: Literal<any>): NonLexicalLiteral | undefined {
  if (lit instanceof NonLexicalLiteral) {
    return lit;
  }
  return undefined;
}
