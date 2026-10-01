import type {
  GeneralSuperTypeDict,
  IDateRepresentation,
  IDateTimeRepresentation,
  IDayTimeDurationRepresentation,
  IDurationRepresentation,
  ITimeRepresentation,
  ITimeZoneRepresentation,
  IYearMonthDurationRepresentation,
} from '@comunica/types';
import { BigNumber } from './BigNumber';
import { TypeURL } from './Consts';
import { simplifyDurationRepresentation } from './DateTimeHelpers';
import { ParseError } from './Errors';
import { roundToFloat } from './FloatingPoint';
import { maximumDayInMonthFor } from './SpecAlgos';

// Lexical spaces as defined by https://www.w3.org/TR/xmlschema-2/#built-in-primitive-datatypes
const XSD_INTEGER_LEXICAL = /^[+-]?\d+$/u;
const XSD_DECIMAL_LEXICAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u;
const XSD_FLOAT_LEXICAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/u;

/**
 * Apply the `collapse` whitespace facet of XSD (https://www.w3.org/TR/xmlschema11-2/#rf-whiteSpace),
 * which is done before casting strings to atomic types, such as numerics.
 *
 * @param value the string to collapse
 */
export function collapseWhitespace(value: string): string {
  return value.replaceAll(/[\t\n\r ]+/gu, ' ').trim();
}

function parseSpecialFloatingPoint(value: string): number | undefined {
  if (value === 'NaN') {
    return Number.NaN;
  }
  if (value === 'INF' || value === '+INF') {
    return Number.POSITIVE_INFINITY;
  }
  if (value === '-INF') {
    return Number.NEGATIVE_INFINITY;
  }
  return undefined;
}

/**
 * Parses double datatypes into a double-precision number,
 * following https://www.w3.org/TR/xmlschema11-2/#f-doubleLexmap.
 *
 * All invalid lexical values return undefined.
 *
 * @param value the string to interpret as a number
 */
export function parseXSDDouble(value: string): number | undefined {
  // JS numbers are doubles, and JS parses numbers with correct rounding.
  return XSD_FLOAT_LEXICAL.test(value) ? Number(value) : parseSpecialFloatingPoint(value);
}

/**
 * Parses float datatypes into a (JS number that is a) single-precision number,
 * following https://www.w3.org/TR/xmlschema11-2/#f-floatLexmap.
 *
 * All invalid lexical values return undefined.
 *
 * @param value the string to interpret as a number
 */
export function parseXSDFloat(value: string): number | undefined {
  if (!XSD_FLOAT_LEXICAL.test(value)) {
    return parseSpecialFloatingPoint(value);
  }
  const float = roundToFloat(new BigNumber(value));
  // Zero keeps the sign of the lexical value.
  return float === 0 && value.startsWith('-') ? -0 : float;
}

/**
 * Parses decimal datatypes (decimal, int, byte, nonPositiveInteger, etc...)
 * into an arbitrary-precision number.
 *
 * All other values, including NaN, INF, and floating point numbers all
 * return undefined;
 *
 * @param value the string to interpret as a number
 */
export function parseXSDDecimal(value: string): BigNumber | undefined {
  return XSD_DECIMAL_LEXICAL.test(value) ? new BigNumber(value) : undefined;
}

/**
 * The value ranges ([minInclusive, maxInclusive], where undefined is unbounded) of the types derived from xsd:integer,
 * as defined by https://www.w3.org/TR/xmlschema11-2/#built-in-derived.
 */
const XSD_INTEGER_RANGES: [TypeURL, BigNumber | undefined, BigNumber | undefined][] = [
  [ TypeURL.XSD_NON_POSITIVE_INTEGER, undefined, new BigNumber(0) ],
  [ TypeURL.XSD_NEGATIVE_INTEGER, undefined, new BigNumber(-1) ],
  [ TypeURL.XSD_LONG, new BigNumber('-9223372036854775808'), new BigNumber('9223372036854775807') ],
  [ TypeURL.XSD_INT, new BigNumber(-2_147_483_648), new BigNumber(2_147_483_647) ],
  [ TypeURL.XSD_SHORT, new BigNumber(-32_768), new BigNumber(32_767) ],
  [ TypeURL.XSD_BYTE, new BigNumber(-128), new BigNumber(127) ],
  [ TypeURL.XSD_NON_NEGATIVE_INTEGER, new BigNumber(0), undefined ],
  [ TypeURL.XSD_UNSIGNED_LONG, new BigNumber(0), new BigNumber('18446744073709551615') ],
  [ TypeURL.XSD_UNSIGNED_INT, new BigNumber(0), new BigNumber(4_294_967_295) ],
  [ TypeURL.XSD_UNSIGNED_SHORT, new BigNumber(0), new BigNumber(65_535) ],
  [ TypeURL.XSD_UNSIGNED_BYTE, new BigNumber(0), new BigNumber(255) ],
  [ TypeURL.XSD_POSITIVE_INTEGER, new BigNumber(1), undefined ],
];

/**
 * Check whether an integer is in the value space of a datatype,
 * which is restricted by the value ranges of the types derived from xsd:integer that the datatype is derived from.
 *
 * @param value the integer value
 * @param superTypeDict the super types of the datatype
 */
export function isInXSDIntegerRange(value: BigNumber, superTypeDict: GeneralSuperTypeDict): boolean {
  return XSD_INTEGER_RANGES.every(([ type, min, max ]) => !(type in superTypeDict) ||
    ((min === undefined || value.gte(min)) && (max === undefined || value.lte(max))));
}

/**
 * Parses integer datatypes (integer, int, byte, nonPositiveInteger, etc...)
 * into an arbitrary-precision number.
 *
 * All other values, including decimals, NaN, INF, and floating point numbers all
 * return undefined;
 *
 * @param value the string to interpret as a number
 */
export function parseXSDInteger(value: string): BigNumber | undefined {
  return XSD_INTEGER_LEXICAL.test(value) ? new BigNumber(value) : undefined;
}

export function parseDateTime(dateTimeStr: string): IDateTimeRepresentation {
  // https://www.w3.org/TR/xmlschema-2/#dateTime
  const [ date, time ] = dateTimeStr.split('T');
  if (time === undefined) {
    throw new ParseError(dateTimeStr, 'dateTime');
  }
  return { ...parseDate(date), ...__parseTime(time) };
}

function parseTimeZone(timeZoneStr: string): Partial<ITimeZoneRepresentation> {
  // https://www.w3.org/TR/xmlschema-2/#dateTime-timezones
  if (timeZoneStr === '') {
    return { zoneHours: undefined, zoneMinutes: undefined };
  }
  if (timeZoneStr === 'Z') {
    return { zoneHours: 0, zoneMinutes: 0 };
  }
  const timeZoneStrings = timeZoneStr.replaceAll(/^([+|-])(\d\d):(\d\d)$/gu, '$11!$2!$3').split('!');
  const timeZone = timeZoneStrings.map(Number);
  return {
    zoneHours: timeZone[0] * timeZone[1],
    zoneMinutes: timeZone[0] * timeZone[2],
  };
}

export function parseDate(dateStr: string): IDateRepresentation {
  // https://www.w3.org/TR/xmlschema-2/#date-lexical-representation
  const formatted = dateStr.replaceAll(
    /^(-)?([123456789]*\d{4})-(\d\d)-(\d\d)(Z|([+-]\d\d:\d\d))?$/gu,
    '$11!$2!$3!$4!$5',
  );
  if (formatted === dateStr) {
    throw new ParseError(dateStr, 'date');
  }
  const dateStrings = formatted.split('!');
  const date = dateStrings.slice(0, -1).map(Number);

  const res = {
    year: date[0] * date[1],
    month: date[2],
    day: date[3],
    ...parseTimeZone(dateStrings[4]),
  };
  if (!(res.month >= 1 && res.month <= 12) || !(res.day >= 1 && res.day <= maximumDayInMonthFor(res.year, res.month))) {
    throw new ParseError(dateStr, 'date');
  }
  return res;
}

function __parseTime(timeStr: string): ITimeRepresentation {
  // https://www.w3.org/TR/xmlschema-2/#time-lexical-repr
  const formatted = timeStr.replaceAll(/^(\d\d):(\d\d):(\d\d(\.\d+)?)(Z|([+-]\d\d:\d\d))?$/gu, '$1!$2!$3!$5');
  if (formatted === timeStr) {
    throw new ParseError(timeStr, 'time');
  }
  const timeStrings = formatted.split('!');
  const time = timeStrings.slice(0, -1).map(Number);

  const res = {
    hours: time[0],
    minutes: time[1],
    seconds: time[2],
    ...parseTimeZone(timeStrings[3]),
  };

  if (res.seconds >= 60 || res.minutes >= 60 || res.hours > 24 ||
    (res.hours === 24 && (res.minutes !== 0 || res.seconds !== 0))) {
    throw new ParseError(timeStr, 'time');
  }
  return res;
}

// We make a separation in internal and external since dateTime will have hour-date rollover,
// but time just does modulo the time.
export function parseTime(timeStr: string): ITimeRepresentation {
  // https://www.w3.org/TR/xmlschema-2/#time-lexical-repr
  const res = __parseTime(timeStr);
  res.hours %= 24;
  return res;
}

export function parseDuration(durationStr: string): Partial<IDurationRepresentation> {
  // https://www.w3.org/TR/xmlschema-2/#duration-lexical-repr
  const [ dayNotation, timeNotation ] = durationStr.split('T');

  // Handle date part
  const formattedDayDur = dayNotation.replaceAll(/^(-)?P(\d+Y)?(\d+M)?(\d+D)?$/gu, '$11S!$2!$3!$4');
  if (formattedDayDur === dayNotation) {
    throw new ParseError(durationStr, 'duration');
  }

  const durationStrings = formattedDayDur.split('!');
  if (timeNotation !== undefined) {
    const formattedTimeDur = timeNotation.replaceAll(/^(\d+H)?(\d+M)?(\d+(\.\d+)?S)?$/gu, '$1!$2!$3');

    if (timeNotation === '' || timeNotation === formattedTimeDur) {
      throw new ParseError(durationStr, 'duration');
    }
    durationStrings.push(...formattedTimeDur.split('!'));
  }
  const duration = durationStrings.map(str => str.slice(0, -1));
  if (!duration.slice(1).some(Boolean)) {
    throw new ParseError(durationStr, 'duration');
  }

  const sign = <-1 | 1> Number(duration[0]);
  return simplifyDurationRepresentation({
    year: duration[1] ? sign * Number(duration[1]) : undefined,
    month: duration[2] ? sign * Number(duration[2]) : undefined,
    day: duration[3] ? sign * Number(duration[3]) : undefined,
    hours: duration[4] ? sign * Number(duration[4]) : undefined,
    minutes: duration[5] ? sign * Number(duration[5]) : undefined,
    seconds: duration[6] ? sign * Number(duration[6]) : undefined,
  });
}

export function parseYearMonthDuration(durationStr: string): Partial<IYearMonthDurationRepresentation> {
  const res = parseDuration(durationStr);
  if ([ 'hours', 'minutes', 'seconds', 'day' ].some(key => Boolean((<any> res)[key]))) {
    throw new ParseError(durationStr, 'yearMonthDuration');
  }
  return res;
}

export function parseDayTimeDuration(durationStr: string): Partial<IDayTimeDurationRepresentation> {
  const res = parseDuration(durationStr);
  if ([ 'year', 'month' ].some(key => Boolean((<any> res)[key]))) {
    throw new ParseError(durationStr, 'dayTimeDuration');
  }
  return res;
}
