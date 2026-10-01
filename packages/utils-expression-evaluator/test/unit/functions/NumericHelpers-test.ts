import {
  BigNumber,
  compareNumericLiterals,
  DecimalLiteral,
  DoubleLiteral,
  FloatLiteral,
  IntegerLiteral,
  numericToDecimal,
  numericToFloat,
} from '../../../lib';

// https://github.com/comunica/comunica/issues/1266
describe('The numeric helpers', () => {
  describe('compareNumericLiterals', () => {
    it('compares integers and decimals with arbitrary precision', () => {
      const small = new IntegerLiteral(new BigNumber('9007199254740992'));
      const large = new IntegerLiteral(new BigNumber('9007199254740993'));
      expect(compareNumericLiterals(small, large)).toBe(-1);
      expect(compareNumericLiterals(large, small)).toBe(1);
      expect(compareNumericLiterals(large, new DecimalLiteral(new BigNumber('9007199254740993.0')))).toBe(0);
    });

    it('returns NaN for unordered arbitrary-precision values', () => {
      const nan = new DecimalLiteral(new BigNumber(Number.NaN));
      expect(compareNumericLiterals(nan, new DecimalLiteral(new BigNumber(0)))).toBeNaN();
    });

    it('promotes decimals to floats when compared to floats', () => {
      const decimal = new DecimalLiteral(new BigNumber('0.1'));
      const float = new FloatLiteral(0.1);
      expect(compareNumericLiterals(decimal, float)).toBe(0);
      expect(compareNumericLiterals(float, decimal)).toBe(0);
    });

    it('promotes decimals and floats to doubles when compared to doubles', () => {
      const decimal = new DecimalLiteral(new BigNumber('0.1'));
      const float = new FloatLiteral(0.1);
      const double = new DoubleLiteral(0.1);
      expect(compareNumericLiterals(decimal, double)).toBe(0);
      expect(compareNumericLiterals(double, decimal)).toBe(0);
      expect(compareNumericLiterals(double, float)).toBe(-1);
      expect(compareNumericLiterals(float, double)).toBe(1);
    });

    it('returns NaN for comparisons with NaN', () => {
      expect(compareNumericLiterals(new DoubleLiteral(Number.NaN), new DoubleLiteral(Number.NaN))).toBeNaN();
      expect(compareNumericLiterals(new DecimalLiteral(new BigNumber(1)), new FloatLiteral(Number.NaN))).toBeNaN();
    });
  });

  describe('numericToFloat', () => {
    it('rounds doubles to single precision', () => {
      expect(numericToFloat(new DoubleLiteral(0.1))).toBe(Math.fround(0.1));
      expect(numericToFloat(new DoubleLiteral(-0))).toBe(-0);
    });

    it('rounds decimals directly to single precision', () => {
      // Halfway between the floats 1 and 1 + 2^-23, but closer to the latter.
      const decimal = new DecimalLiteral(new BigNumber('1.00000005960464477539062500000001'));
      expect(numericToFloat(decimal)).toBe(1 + 2 ** -23);
      // Rounding via a double first would give 1.
      expect(Math.fround(decimal.toNumber())).toBe(1);
    });

    it('promotes decimals directly to single precision when compared to floats', () => {
      const decimal = new DecimalLiteral(new BigNumber('1.00000005960464477539062500000001'));
      expect(compareNumericLiterals(decimal, new FloatLiteral(1 + 2 ** -23))).toBe(0);
    });
  });

  describe('numericToDecimal', () => {
    it('returns arbitrary-precision values as is', () => {
      const value = new BigNumber('0.1000000000000000000001');
      expect(numericToDecimal(new DecimalLiteral(value))).toBe(value);
    });

    it('converts doubles to their exact decimal value', () => {
      expect(numericToDecimal(new DoubleLiteral(0.1)))
        .toEqual(new BigNumber('0.1000000000000000055511151231257827021181583404541015625'));
      expect(numericToDecimal(new DoubleLiteral(0.5))).toEqual(new BigNumber('0.5'));
      expect(numericToDecimal(new DoubleLiteral(1e23))).toEqual(new BigNumber('99999999999999991611392'));
      expect(numericToDecimal(new DoubleLiteral(-0))).toEqual(new BigNumber('0'));
    });

    it('converts floats to their exact decimal value', () => {
      expect(numericToDecimal(new FloatLiteral(0.1))).toEqual(new BigNumber('0.100000001490116119384765625'));
    });

    it('does not convert NaN and infinities', () => {
      expect(numericToDecimal(new DoubleLiteral(Number.NaN))).toBeUndefined();
      expect(numericToDecimal(new FloatLiteral(Number.POSITIVE_INFINITY))).toBeUndefined();
      expect(numericToDecimal(new DoubleLiteral(Number.NEGATIVE_INFINITY))).toBeUndefined();
    });
  });
});
