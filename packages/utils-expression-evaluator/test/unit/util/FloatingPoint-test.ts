import { BigNumber } from '../../../lib/util/BigNumber';
import { exactDecimal, roundToFloat } from '../../../lib/util/FloatingPoint';

const FLOAT_MAX = 3.4028234663852886e38;

// Without arguments, BigNumber.toFixed returns all digits, without exponential notation.
// eslint-disable-next-line unicorn/require-number-to-fixed-digits-argument
const plain = (value: BigNumber): string => value.toFixed();

describe('util/FloatingPoint', () => {
  describe('exactDecimal', () => {
    it.each([
      [ 0, '0' ],
      [ 1, '1' ],
      [ -2.5, '-2.5' ],
      [ 0.1, '0.1000000000000000055511151231257827021181583404541015625' ],
      [ 1e23, '99999999999999991611392' ],
      [ 2 ** 70, '1180591620717411303424' ],
      [ Number.MIN_VALUE, plain(new BigNumber(5).pow(1074).shiftedBy(-1074)) ],
      [ Number.MAX_VALUE, plain(new BigNumber(2).pow(1024).minus(new BigNumber(2).pow(971))) ],
    ])('determines the exact value of %d', (value, expected) => {
      expect(plain(exactDecimal(value))).toBe(expected);
    });
  });

  describe('roundToFloat', () => {
    it.each([
      [ '0', 0 ],
      [ '0.1', Math.fround(0.1) ],
      [ '-0.1', Math.fround(-0.1) ],
      [ '16777217', 16_777_216 ],
      [ '16777219', 16_777_220 ],
      [ '1e-50', 0 ],
      [ '1e-46', 0 ],
      [ '1e-45', 2 ** -149 ],
      [ '1e39', Number.POSITIVE_INFINITY ],
      [ '-1e400', Number.NEGATIVE_INFINITY ],
      [ '3.4028234663852886e38', FLOAT_MAX ],
      [ '3.40282356779733661637539395458142568447e38', FLOAT_MAX ],
      [ '3.40282356779733661637539395458142568448e38', Number.POSITIVE_INFINITY ],
    ])('rounds %s to the nearest float', (value, expected) => {
      expect(roundToFloat(new BigNumber(value))).toBe(expected);
    });

    describe('when the decimal rounds to a double that is halfway between two floats', () => {
      // Negative powers of 2 are created from their exact value, as BigNumber.pow rounds them.
      const ulp = exactDecimal(2 ** -24);
      const tiny = exactDecimal(2 ** -80);
      // 1 + 2^-24 is exactly halfway between the floats 1 and 1 + 2^-23.
      const halfway = ulp.plus(1);

      it('rounds exact ties to even', () => {
        expect(roundToFloat(halfway)).toBe(1);
        expect(roundToFloat(halfway.negated())).toBe(-1);
        // 1 + 3 × 2^-24 is exactly halfway between the floats 1 + 2^-23 and 1 + 2^-22.
        expect(roundToFloat(ulp.times(3).plus(1))).toBe(1 + 2 ** -22);
      });

      it('rounds up when the decimal is just above', () => {
        expect(halfway.plus(tiny).toNumber()).toBe(1 + 2 ** -24);
        expect(roundToFloat(halfway.plus(tiny))).toBe(1 + 2 ** -23);
        expect(roundToFloat(halfway.plus(tiny).negated())).toBe(-1 - 2 ** -23);
      });

      it('keeps the rounding of the double when the decimal is on the same side', () => {
        // Just below the halfway between 1 and 1 + 2^-23, where Math.fround rounds the double down to 1.
        expect(roundToFloat(halfway.minus(tiny))).toBe(1);
        // Just above the halfway between 1 + 2^-23 and 1 + 2^-22, where Math.fround rounds the double up.
        expect(roundToFloat(ulp.times(3).plus(1).plus(tiny))).toBe(1 + 2 ** -22);
      });

      it('rounds down when the decimal is just below', () => {
        const odd = ulp.times(3).plus(1);
        expect(odd.minus(tiny).toNumber()).toBe(1 + 3 * 2 ** -24);
        expect(roundToFloat(odd.minus(tiny))).toBe(1 + 2 ** -23);
      });

      it('rounds below the overflow threshold to the largest float', () => {
        const overflow = new BigNumber(2).pow(128).minus(new BigNumber(2).pow(103));
        expect(roundToFloat(overflow.minus(new BigNumber(2).pow(40)))).toBe(FLOAT_MAX);
        expect(roundToFloat(overflow)).toBe(Number.POSITIVE_INFINITY);
      });
    });
  });
});
