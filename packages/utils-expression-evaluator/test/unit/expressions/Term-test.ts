import type { ISuperTypeProvider } from '@comunica/types';
import { getMockSuperTypeProvider } from '@comunica/utils-jest';
import { DataFactory } from 'rdf-data-factory';
import {
  BigNumber,
  TypeURL,
  DoubleLiteral,
  FloatLiteral,
  IntegerLiteral,
  isNonLexicalLiteral,
  NonLexicalLiteral,
  DecimalLiteral,
} from '../../../lib';

const DF = new DataFactory();

describe('Term', () => {
  describe('has isNonLexicalLiteral function', () => {
    it('detects nonLexicalLiterals', () => {
      const superTypeProvider: ISuperTypeProvider = getMockSuperTypeProvider();
      expect(isNonLexicalLiteral(new NonLexicalLiteral(undefined, TypeURL.XSD_DECIMAL, superTypeProvider, '1')))
        .toBeTruthy();
    });

    it('detects when literal is not NonLexicalLiteral', () => {
      expect(isNonLexicalLiteral(new IntegerLiteral(new BigNumber(1))))
        .toBeFalsy();
    });
  });

  describe('the string representation of numeric literals', () => {
    describe('like integers', () => {
      it('should properly express zero', () => {
        const num = new IntegerLiteral(new BigNumber(0e0));
        expect(num.toRDF(DF).value).toBe('0');
      });

      it('should properly express one', () => {
        const num = new IntegerLiteral(new BigNumber(1e0));
        expect(num.toRDF(DF).value).toBe('1');
      });

      it('should properly express small integer numbers', () => {
        const num = new IntegerLiteral(new BigNumber(1.234e3));
        expect(num.toRDF(DF).value).toBe('1234');
      });

      it('should properly express large integer numbers', () => {
        const num = new IntegerLiteral(new BigNumber(1e8));
        expect(num.toRDF(DF).value).toBe('100000000');
      });
    });

    describe('like arbitrary-precision integers', () => {
      it('should not lose precision for very large integers', () => {
        const num = new IntegerLiteral(new BigNumber('123456789012345678901234567890'));
        expect(num.toRDF(DF).value).toBe('123456789012345678901234567890');
      });

      it('should normalize negative zero', () => {
        const num = new IntegerLiteral(new BigNumber('-0'));
        expect(num.toRDF(DF).value).toBe('0');
        expect(num.typedValue.isNegative()).toBe(false);
        expect(Object.is(num.toNumber(), 0)).toBe(true);
      });
    });

    describe('like arbitrary-precision decimals', () => {
      it('should not lose precision for decimals with many digits', () => {
        const num = new DecimalLiteral(new BigNumber('12345678901234567890.123456789012345678901'));
        expect(num.toRDF(DF).value).toBe('12345678901234567890.123456789012345678901');
      });

      it('should not use exponential notation for very small decimals', () => {
        const num = new DecimalLiteral(new BigNumber('1e-30'));
        expect(num.toRDF(DF).value).toBe('0.000000000000000000000000000001');
      });

      it('should not use exponential notation for very large decimals', () => {
        const num = new DecimalLiteral(new BigNumber('1e30'));
        expect(num.toRDF(DF).value).toBe('1000000000000000000000000000000.0');
      });

      it('should strip trailing zeroes', () => {
        const num = new DecimalLiteral(new BigNumber('1.500'));
        expect(num.toRDF(DF).value).toBe('1.5');
      });

      it('should normalize negative zero', () => {
        const num = new DecimalLiteral(new BigNumber('-0.0'));
        expect(num.toRDF(DF).value).toBe('0.0');
        expect(Object.is(num.toNumber(), 0)).toBe(true);
      });
    });

    describe('like decimals', () => {
      it('should properly express zero', () => {
        const num = new DecimalLiteral(new BigNumber(0e0));
        expect(num.toRDF(DF).value).toBe('0.0');
      });

      it('should always include decimal point', () => {
        const num = new DecimalLiteral(new BigNumber(1e0));
        expect(num.toRDF(DF).value).toBe('1.0');
      });

      it('should properly express small positive decimal numbers', () => {
        const num = new DecimalLiteral(new BigNumber(1e-12));
        expect(num.toRDF(DF).value).toBe('0.000000000001');
      });

      it('should properly express large positive decimal numbers', () => {
        const num = new DecimalLiteral(new BigNumber(100000000000.333));
        expect(num.toRDF(DF).value).toBe('100000000000.333');
      });

      it('should properly express small negative decimal numbers', () => {
        const num = new DecimalLiteral(new BigNumber(-1e-12));
        expect(num.toRDF(DF).value).toBe('-0.000000000001');
      });

      it('should properly express large negative decimal numbers', () => {
        const num = new DecimalLiteral(new BigNumber(-100000000000.3));
        expect(num.toRDF(DF).value).toBe('-100000000000.3');
      });
    });

    describe.each([
      [ 'doubles', (val: number) => new DoubleLiteral(val) ],
      [ 'floats', (val: number) => new FloatLiteral(val) ],
    ])('like %s', (_, createLiteral) => {
      it('should properly express NaN', () => {
        const num = createLiteral(Number.NaN);
        expect(num.toRDF(DF).value).toBe('NaN');
      });

      it('should properly express positive infinity', () => {
        const num = createLiteral(Number.POSITIVE_INFINITY);
        expect(num.toRDF(DF).value).toBe('INF');
      });

      it('should properly express negative infinity', () => {
        const num = createLiteral(Number.NEGATIVE_INFINITY);
        expect(num.toRDF(DF).value).toBe('-INF');
      });

      it('should properly express zero', () => {
        const num = createLiteral(0);
        expect(num.toRDF(DF).value).toBe('0.0E0');
      });

      it('should properly express negative zero', () => {
        const num = createLiteral(-0);
        expect(num.toRDF(DF).value).toBe('-0.0E0');
      });

      it('should properly express large positive finite values', () => {
        const num = createLiteral(1100);
        expect(num.toRDF(DF).value).toBe('1.1E3');
      });

      it('should properly express small positive finite values', () => {
        const num = createLiteral(0.01);
        expect(num.toRDF(DF).value).toBe('1.0E-2');
      });

      it('should properly express large negative finite values', () => {
        const num = createLiteral(-1100);
        expect(num.toRDF(DF).value).toBe('-1.1E3');
      });

      it('should properly express small negative finite values', () => {
        const num = createLiteral(-0.01);
        expect(num.toRDF(DF).value).toBe('-1.0E-2');
      });
    });

    describe('like floats', () => {
      it('should round the value to single precision', () => {
        expect(new FloatLiteral(0.1).typedValue).toBe(Math.fround(0.1));
      });

      it('should use the shortest representation of the single precision value', () => {
        expect(new FloatLiteral(0.1).toRDF(DF).value).toBe('1.0E-1');
        expect(new FloatLiteral(16_777_217).toRDF(DF).value).toBe('1.6777216E7');
        expect(new FloatLiteral(3.4028234663852886e38).toRDF(DF).value).toBe('3.4028235E38');
        expect(new FloatLiteral(1e-45).toRDF(DF).value).toBe('1.0E-45');
      });

      it('should use 9 significant digits when required', () => {
        expect(new FloatLiteral(1.1539286504103075e-7).toRDF(DF).value).toBe('1.15392865E-7');
      });
    });

    describe('like doubles', () => {
      it('should not round the value to single precision', () => {
        expect(new DoubleLiteral(0.1).typedValue).toBe(0.1);
        expect(new DoubleLiteral(0.1 + 0.2).toRDF(DF).value).toBe('3.0000000000000004E-1');
      });
    });
  });

  describe('the effective boolean value of numeric literals', () => {
    it.each([
      [ 'integer zero', new IntegerLiteral(new BigNumber(0)), false ],
      [ 'integer non-zero', new IntegerLiteral(new BigNumber('-1')), true ],
      [ 'decimal zero', new DecimalLiteral(new BigNumber('0.0')), false ],
      [ 'decimal tiny', new DecimalLiteral(new BigNumber('1e-400')), true ],
      [ 'double zero', new DoubleLiteral(0), false ],
      [ 'double NaN', new DoubleLiteral(Number.NaN), false ],
      [ 'double non-zero', new DoubleLiteral(0.1), true ],
      [ 'float tiny', new FloatLiteral(1e-50), false ],
    ])('should be correct for %s', (_, literal, ebv) => {
      expect(literal.coerceEBV()).toBe(ebv);
    });
  });

  describe('the JS number value of numeric literals', () => {
    it('should convert arbitrary-precision numbers to the closest double', () => {
      expect(new DecimalLiteral(new BigNumber('0.1000000000000000000001')).toNumber()).toBe(0.1);
      expect(new IntegerLiteral(new BigNumber('9007199254740993')).toNumber()).toBe(9_007_199_254_740_992);
    });

    it('should return floating point numbers as is', () => {
      expect(new DoubleLiteral(0.1).toNumber()).toBe(0.1);
      expect(new FloatLiteral(0.1).toNumber()).toBe(Math.fround(0.1));
    });
  });
});
