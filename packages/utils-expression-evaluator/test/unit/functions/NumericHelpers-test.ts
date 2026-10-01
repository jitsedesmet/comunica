import {
  BigNumber,
  compareNumericLiterals,
  DecimalLiteral,
  DoubleLiteral,
  FloatLiteral,
  IntegerLiteral,
  numericToDecimal,
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
      expect(compareNumericLiterals(new DecimalLiteral(Number.NaN), new DecimalLiteral(0))).toBeNaN();
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
      expect(compareNumericLiterals(new DecimalLiteral(1), new FloatLiteral(Number.NaN))).toBeNaN();
    });
  });

  describe('numericToDecimal', () => {
    it('returns arbitrary-precision values as is', () => {
      const value = new BigNumber('0.1000000000000000000001');
      expect(numericToDecimal(new DecimalLiteral(value))).toBe(value);
    });

    it('converts doubles to the decimal with the shortest representation', () => {
      expect(numericToDecimal(new DoubleLiteral(0.1))).toEqual(new BigNumber('0.1'));
      expect(numericToDecimal(new DoubleLiteral(0.1 + 0.2))).toEqual(new BigNumber('0.30000000000000004'));
      expect(numericToDecimal(new DoubleLiteral(1e21))).toEqual(new BigNumber('1000000000000000000000'));
    });

    it('converts floats to the decimal with the shortest representation', () => {
      expect(numericToDecimal(new FloatLiteral(0.1))).toEqual(new BigNumber('0.1'));
    });

    it('does not convert NaN and infinities', () => {
      expect(numericToDecimal(new DoubleLiteral(Number.NaN))).toBeUndefined();
      expect(numericToDecimal(new FloatLiteral(Number.POSITIVE_INFINITY))).toBeUndefined();
      expect(numericToDecimal(new DoubleLiteral(Number.NEGATIVE_INFINITY))).toBeUndefined();
    });
  });
});
