import type {
  IDateRepresentation,
  IDateTimeRepresentation,
  IDayTimeDurationRepresentation,
  IDurationRepresentation,
  ITimeRepresentation,
  ITimeZoneRepresentation,
  IYearMonthDurationRepresentation,
} from '@comunica/types';
import { simplifyDurationRepresentation } from './DateTimeHelpers';
import { ParseError } from './Errors';
import { maximumDayInMonthFor } from './SpecAlgos';

/**
 * Parses float datatypes (double, float).
 *
 * All invalid lexical values return undefined.
 *
 * @param value the string to interpret as a number
 */
export function parseXSDFloat(value: string): number | undefined {
  const numb = Number(value);
  if (Number.isNaN(numb)) {
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
  return numb;
}

/**
 * Parses decimal datatypes (decimal, int, byte, nonPositiveInteger, etc...).
 *
 * All other values, including NaN, INF, and floating point numbers all
 * return undefined;
 *
 * @param value the string to interpret as a number
 */
export function parseXSDDecimal(value: string): number | undefined {
  const numb = Number(value);
  return Number.isNaN(numb) ? undefined : numb;
}

/**
 * Return the parsed value, or throw a {@link ParseError} if parsing failed.
 * @param parsed The parsed value, or undefined if parsing failed.
 * @param value The string that was parsed.
 * @param type The name of the type the string was parsed as.
 * @return The parsed value.
 */
function parsedOrThrow<T>(parsed: T | undefined, value: string, type: string): T {
  if (parsed === undefined) {
    throw new ParseError(value, type);
  }
  return parsed;
}

/**
 * Parses an xsd:dateTime.
 * @param dateTimeStr The string to parse.
 * @return The dateTime, or undefined if the string is not a valid xsd:dateTime.
 */
export function parseDateTimeOrUndefined(dateTimeStr: string): IDateTimeRepresentation | undefined {
  // https://www.w3.org/TR/xmlschema-2/#dateTime
  const [ date, time ] = dateTimeStr.split('T');
  if (time === undefined) {
    return undefined;
  }
  const parsedDate = parseDateOrUndefined(date);
  if (!parsedDate) {
    return undefined;
  }
  const parsedTime = parseTimeAllowingHour24OrUndefined(time);
  return parsedTime && { ...parsedDate, ...parsedTime };
}

/**
 * Parses an xsd:dateTime, throwing a {@link ParseError} if the string is not a valid xsd:dateTime.
 * @param dateTimeStr The string to parse.
 * @return The dateTime.
 */
export function parseDateTime(dateTimeStr: string): IDateTimeRepresentation {
  return parsedOrThrow(parseDateTimeOrUndefined(dateTimeStr), dateTimeStr, 'dateTime');
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

/**
 * Parses an xsd:date.
 * @param dateStr The string to parse.
 * @return The date, or undefined if the string is not a valid xsd:date.
 */
export function parseDateOrUndefined(dateStr: string): IDateRepresentation | undefined {
  // https://www.w3.org/TR/xmlschema-2/#date-lexical-representation
  const formatted = dateStr.replaceAll(
    /^(-)?([123456789]*\d{4})-(\d\d)-(\d\d)(Z|([+-]\d\d:\d\d))?$/gu,
    '$11!$2!$3!$4!$5',
  );
  if (formatted === dateStr) {
    return undefined;
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
    return undefined;
  }
  return res;
}

/**
 * Parses an xsd:date, throwing a {@link ParseError} if the string is not a valid xsd:date.
 * @param dateStr The string to parse.
 * @return The date.
 */
export function parseDate(dateStr: string): IDateRepresentation {
  return parsedOrThrow(parseDateOrUndefined(dateStr), dateStr, 'date');
}

/**
 * Parses an xsd:time, keeping 24:00:00 so a dateTime can roll it over to the next day.
 * @param timeStr The string to parse.
 * @return The time, or undefined if the string is not a valid xsd:time.
 */
function parseTimeAllowingHour24OrUndefined(timeStr: string): ITimeRepresentation | undefined {
  // https://www.w3.org/TR/xmlschema-2/#time-lexical-repr
  const formatted = timeStr.replaceAll(/^(\d\d):(\d\d):(\d\d(\.\d+)?)(Z|([+-]\d\d:\d\d))?$/gu, '$1!$2!$3!$5');
  if (formatted === timeStr) {
    return undefined;
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
    return undefined;
  }
  return res;
}

/**
 * Parses an xsd:time.
 * @param timeStr The string to parse.
 * @return The time, or undefined if the string is not a valid xsd:time.
 */
export function parseTimeOrUndefined(timeStr: string): ITimeRepresentation | undefined {
  const res = parseTimeAllowingHour24OrUndefined(timeStr);
  if (res) {
    res.hours %= 24;
  }
  return res;
}

/**
 * Parses an xsd:time, throwing a {@link ParseError} if the string is not a valid xsd:time.
 * @param timeStr The string to parse.
 * @return The time.
 */
export function parseTime(timeStr: string): ITimeRepresentation {
  return parsedOrThrow(parseTimeOrUndefined(timeStr), timeStr, 'time');
}

/**
 * Parses an xsd:duration.
 * @param durationStr The string to parse.
 * @return The duration, or undefined if the string is not a valid xsd:duration.
 */
export function parseDurationOrUndefined(durationStr: string): Partial<IDurationRepresentation> | undefined {
  // https://www.w3.org/TR/xmlschema-2/#duration-lexical-repr
  const [ dayNotation, timeNotation ] = durationStr.split('T');

  // Handle date part
  const formattedDayDur = dayNotation.replaceAll(/^(-)?P(\d+Y)?(\d+M)?(\d+D)?$/gu, '$11S!$2!$3!$4');
  if (formattedDayDur === dayNotation) {
    return undefined;
  }

  const durationStrings = formattedDayDur.split('!');
  if (timeNotation !== undefined) {
    const formattedTimeDur = timeNotation.replaceAll(/^(\d+H)?(\d+M)?(\d+(\.\d+)?S)?$/gu, '$1!$2!$3');

    if (timeNotation === '' || timeNotation === formattedTimeDur) {
      return undefined;
    }
    durationStrings.push(...formattedTimeDur.split('!'));
  }
  const duration = durationStrings.map(str => str.slice(0, -1));
  if (!duration.slice(1).some(Boolean)) {
    return undefined;
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

/**
 * Parses an xsd:duration, throwing a {@link ParseError} if the string is not a valid xsd:duration.
 * @param durationStr The string to parse.
 * @return The duration.
 */
export function parseDuration(durationStr: string): Partial<IDurationRepresentation> {
  return parsedOrThrow(parseDurationOrUndefined(durationStr), durationStr, 'duration');
}

/**
 * Parses an xsd:yearMonthDuration.
 * @param durationStr The string to parse.
 * @return The duration, or undefined if the string is not a valid xsd:yearMonthDuration.
 */
export function parseYearMonthDurationOrUndefined(durationStr: string):
Partial<IYearMonthDurationRepresentation> | undefined {
  const res = parseDurationOrUndefined(durationStr);
  if (!res || [ 'hours', 'minutes', 'seconds', 'day' ].some(key => Boolean((<any> res)[key]))) {
    return undefined;
  }
  return res;
}

/**
 * Parses an xsd:yearMonthDuration, throwing a {@link ParseError} if the string is not a valid xsd:yearMonthDuration.
 * @param durationStr The string to parse.
 * @return The duration.
 */
export function parseYearMonthDuration(durationStr: string): Partial<IYearMonthDurationRepresentation> {
  return parsedOrThrow(parseYearMonthDurationOrUndefined(durationStr), durationStr, 'yearMonthDuration');
}

/**
 * Parses an xsd:dayTimeDuration.
 * @param durationStr The string to parse.
 * @return The duration, or undefined if the string is not a valid xsd:dayTimeDuration.
 */
export function parseDayTimeDurationOrUndefined(durationStr: string):
Partial<IDayTimeDurationRepresentation> | undefined {
  const res = parseDurationOrUndefined(durationStr);
  if (!res || [ 'year', 'month' ].some(key => Boolean((<any> res)[key]))) {
    return undefined;
  }
  return res;
}

/**
 * Parses an xsd:dayTimeDuration, throwing a {@link ParseError} if the string is not a valid xsd:dayTimeDuration.
 * @param durationStr The string to parse.
 * @return The duration.
 */
export function parseDayTimeDuration(durationStr: string): Partial<IDayTimeDurationRepresentation> {
  return parsedOrThrow(parseDayTimeDurationOrUndefined(durationStr), durationStr, 'dayTimeDuration');
}
