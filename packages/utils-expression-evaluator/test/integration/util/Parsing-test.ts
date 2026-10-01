import { BigNumber } from '../../../lib/util/BigNumber';
import {
  parseDate,
  parseDateTime,
  parseXSDDecimal,
  parseXSDFloat,
  parseXSDInteger,
} from '../../../lib/util/Parsing';

describe('util/parsing', () => {
  describe('parseXSDInteger', () => {
    it.each([
      [ '0', '0' ],
      [ '-1', '-1' ],
      [ '+01', '1' ],
      [ '123456789012345678901234567890', '123456789012345678901234567890' ],
    ])('should parse %j without losing precision', (value, expected) => {
      expect(parseXSDInteger(value)).toEqual(new BigNumber(expected));
    });

    it.each([ '', '1.0', '1e3', '0x1F', ' 1', 'Infinity', 'NaN', '+' ])('should not parse %j', (value) => {
      expect(parseXSDInteger(value)).toBeUndefined();
    });
  });

  describe('parseXSDDecimal', () => {
    it.each([
      [ '0', '0' ],
      [ '-1.5', '-1.5' ],
      [ '+.5', '0.5' ],
      [ '1.', '1' ],
      [ '0.1000000000000000000000000000001', '0.1000000000000000000000000000001' ],
    ])('should parse %j without losing precision', (value, expected) => {
      expect(parseXSDDecimal(value)).toEqual(new BigNumber(expected));
    });

    it.each([ '', '.', '1e3', '0x1F', ' 1', 'Infinity', 'INF', 'NaN', '-' ])('should not parse %j', (value) => {
      expect(parseXSDDecimal(value)).toBeUndefined();
    });
  });

  describe('parseXSDFloat', () => {
    it.each([
      [ '0', 0 ],
      [ '-1.5E2', -150 ],
      [ '.5e-1', 0.05 ],
      [ '1.', 1 ],
      [ '0.1', 0.1 ],
      [ 'INF', Number.POSITIVE_INFINITY ],
      [ '+INF', Number.POSITIVE_INFINITY ],
      [ '-INF', Number.NEGATIVE_INFINITY ],
      [ 'NaN', Number.NaN ],
    ])('should parse %j', (value, expected) => {
      expect(parseXSDFloat(value)).toBe(expected);
    });

    it.each([ '', '.', '1e', '0x1F', ' 1', 'Infinity', '-NaN', 'inf' ])('should not parse %j', (value) => {
      expect(parseXSDFloat(value)).toBeUndefined();
    });
  });

  describe('parseXSDDateTime', () => {
    it('should parse dates correctly', () => {
      expect(parseDateTime('2010-06-21T11:28:01Z')).toEqual({
        year: 2_010,
        month: 6,
        day: 21,
        hours: 11,
        minutes: 28,
        seconds: 1,
        zoneHours: 0,
        zoneMinutes: 0,
      });

      expect(parseDateTime('2010-12-21T15:38:02-08:00')).toEqual({
        year: 2_010,
        month: 12,
        day: 21,
        hours: 15,
        minutes: 38,
        seconds: 2,
        zoneHours: -8,
        zoneMinutes: -0,
      });

      expect(parseDateTime('2008-06-20T23:59:00Z')).toEqual({
        year: 2_008,
        month: 6,
        day: 20,
        hours: 23,
        minutes: 59,
        seconds: 0,
        zoneHours: 0,
        zoneMinutes: 0,
      });

      expect(parseDateTime('2011-02-01T01:02:03')).toEqual({
        year: 2_011,
        month: 2,
        day: 1,
        hours: 1,
        minutes: 2,
        seconds: 3,
        zoneHours: undefined,
        zoneMinutes: undefined,
      });

      expect(parseDate('2011-02-01')).toEqual({
        year: 2_011,
        month: 2,
        day: 1,
        zoneHours: undefined,
        zoneMinutes: undefined,
      });
    });
  });
});
