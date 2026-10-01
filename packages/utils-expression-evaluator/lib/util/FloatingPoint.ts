import { BigNumber } from './BigNumber';

// Shared buffers to inspect the binary representation of floating point numbers.
const float32 = new Float32Array(1);
const uint32 = new Uint32Array(float32.buffer);
const float64 = new Float64Array(1);
const uint64 = new BigUint64Array(float64.buffer);

// The value that single precision numbers overflow to, as if the exponent range were unbounded.
const FLOAT_OVERFLOW = 2 ** 128;

/**
 * Determine the exact decimal value of a finite double.
 * Every double is a dyadic rational, so its decimal expansion is always finite.
 * For example, the double closest to 0.1 is 0.1000000000000000055511151231257827021181583404541015625.
 *
 * @param value A finite double.
 * @returns The exact value as an arbitrary-precision decimal.
 */
export function exactDecimal(value: number): BigNumber {
  float64[0] = value;
  const bits = uint64[0];
  const biasedExponent = Number((bits >> 52n) & 0x7FFn);
  const fraction = bits & 0xF_FFFF_FFFF_FFFFn;
  // Value = mantissa × 2^exponent, with an implicit leading bit for normal numbers.
  const mantissa = biasedExponent === 0 ? fraction : fraction | 0x10_0000_0000_0000n;
  const exponent = (biasedExponent === 0 ? 1 : biasedExponent) - 1_075;
  // Negative powers of 2 are written as 2^-e = 5^e / 10^e to keep the computation exact.
  const magnitude = exponent >= 0 ?
    new BigNumber((mantissa << BigInt(exponent)).toString()) :
    new BigNumber((mantissa * 5n ** BigInt(-exponent)).toString()).shiftedBy(exponent);
  return value < 0 ? magnitude.negated() : magnitude;
}

/**
 * Determine the single precision number adjacent to the given one, in the direction of the target.
 * @param value A single precision number, or an infinity.
 * @param target A number different from value.
 */
function adjacentFloat(value: number, target: number): number {
  if (value === 0) {
    return Math.sign(target) * 2 ** -149;
  }
  float32[0] = value;
  // The bit patterns of floats of the same sign are ordered by magnitude.
  uint32[0] += (target > value) === (value > 0) ? 1 : -1;
  return float32[0];
}

/**
 * Round an arbitrary-precision decimal to the nearest single precision number (ties to even),
 * as required by https://www.w3.org/TR/xmlschema11-2/#f-floatLexmap.
 *
 * Rounding to a double first and then to a single precision number can give a different result (double rounding),
 * which only happens when the intermediate double lies exactly halfway between two single precision numbers.
 * In that case, the exact decimal value decides the rounding direction.
 *
 * @param value An arbitrary-precision decimal.
 * @returns The closest single precision number.
 */
export function roundToFloat(value: BigNumber): number {
  const double = value.toNumber();
  const float = Math.fround(double);
  if (float === double || !Number.isFinite(double)) {
    return float;
  }
  const other = adjacentFloat(float, double);
  const asFinite = (num: number): number => Number.isFinite(num) ? num : Math.sign(num) * FLOAT_OVERFLOW;
  const halfway = (asFinite(float) + asFinite(other)) / 2;
  if (double !== halfway) {
    return float;
  }
  // When the decimal is exactly halfway, Math.fround already rounded ties to even.
  // The comparison is never null, as neither value is NaN.
  const comparison = <number> value.comparedTo(exactDecimal(halfway));
  if (comparison === 0) {
    return float;
  }
  return (comparison > 0) === (other > float) ? other : float;
}
