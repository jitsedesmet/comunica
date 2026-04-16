import { getMockSuperTypeProvider } from '@comunica/utils-expression-evaluator/test/util/helpers';
import { DataFactory } from 'rdf-data-factory';
import { InvalidLiteralBoundBehavior, NonLexicalLiteral, TermTransformer, TypeURL } from '../../../lib';

const DF = new DataFactory();

describe('Bound Checking for Literals', () => {
  describe('with IGNORE behavior (default)', () => {
    let termTransformer: TermTransformer;
    beforeEach(() => {
      termTransformer = new TermTransformer(getMockSuperTypeProvider(), InvalidLiteralBoundBehavior.IGNORE);
    });

    it('allows a valid xsd:byte value', () => {
      const lit = DF.literal('100', DF.namedNode(TypeURL.XSD_BYTE));
      const result = termTransformer.transformLiteral(lit);
      expect(result).not.toBeInstanceOf(NonLexicalLiteral);
      expect(result.typedValue).toBe(100);
    });

    it('allows an out-of-bounds xsd:byte value', () => {
      const lit = DF.literal('200', DF.namedNode(TypeURL.XSD_BYTE));
      const result = termTransformer.transformLiteral(lit);
      expect(result).not.toBeInstanceOf(NonLexicalLiteral);
      expect(result.typedValue).toBe(200);
    });

    it('allows a valid xsd:short value', () => {
      const lit = DF.literal('30000', DF.namedNode(TypeURL.XSD_SHORT));
      const result = termTransformer.transformLiteral(lit);
      expect(result).not.toBeInstanceOf(NonLexicalLiteral);
      expect(result.typedValue).toBe(30_000);
    });

    it('allows an out-of-bounds xsd:short value', () => {
      const lit = DF.literal('40000', DF.namedNode(TypeURL.XSD_SHORT));
      const result = termTransformer.transformLiteral(lit);
      expect(result).not.toBeInstanceOf(NonLexicalLiteral);
      expect(result.typedValue).toBe(40_000);
    });

    it('allows a valid xsd:int value', () => {
      const lit = DF.literal('2000000000', DF.namedNode(TypeURL.XSD_INT));
      const result = termTransformer.transformLiteral(lit);
      expect(result).not.toBeInstanceOf(NonLexicalLiteral);
      expect(result.typedValue).toBe(2_000_000_000);
    });

    it('allows an out-of-bounds xsd:int value', () => {
      const lit = DF.literal('3000000000', DF.namedNode(TypeURL.XSD_INT));
      const result = termTransformer.transformLiteral(lit);
      expect(result).not.toBeInstanceOf(NonLexicalLiteral);
      expect(result.typedValue).toBe(3_000_000_000);
    });
  });

  describe('with ERROR behavior', () => {
    let termTransformer: TermTransformer;
    beforeEach(() => {
      termTransformer = new TermTransformer(getMockSuperTypeProvider(), InvalidLiteralBoundBehavior.ERROR);
    });

    describe('xsd:byte bounds (-128 to 127)', () => {
      it('allows the minimum value', () => {
        const lit = DF.literal('-128', DF.namedNode(TypeURL.XSD_BYTE));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(-128);
      });

      it('allows the maximum value', () => {
        const lit = DF.literal('127', DF.namedNode(TypeURL.XSD_BYTE));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(127);
      });

      it('creates NonLexicalLiteral for value below minimum', () => {
        const lit = DF.literal('-129', DF.namedNode(TypeURL.XSD_BYTE));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });

      it('creates NonLexicalLiteral for value above maximum', () => {
        const lit = DF.literal('128', DF.namedNode(TypeURL.XSD_BYTE));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });

      it('creates NonLexicalLiteral for floating point value', () => {
        const lit = DF.literal('100.5', DF.namedNode(TypeURL.XSD_BYTE));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });
    });

    describe('xsd:short bounds (-32768 to 32767)', () => {
      it('allows the minimum value', () => {
        const lit = DF.literal('-32768', DF.namedNode(TypeURL.XSD_SHORT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(-32_768);
      });

      it('allows the maximum value', () => {
        const lit = DF.literal('32767', DF.namedNode(TypeURL.XSD_SHORT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(32_767);
      });

      it('creates NonLexicalLiteral for value below minimum', () => {
        const lit = DF.literal('-32769', DF.namedNode(TypeURL.XSD_SHORT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });

      it('creates NonLexicalLiteral for value above maximum', () => {
        const lit = DF.literal('32768', DF.namedNode(TypeURL.XSD_SHORT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });
    });

    describe('xsd:int bounds (-2147483648 to 2147483647)', () => {
      it('allows the minimum value', () => {
        const lit = DF.literal('-2147483648', DF.namedNode(TypeURL.XSD_INT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(-2_147_483_648);
      });

      it('allows the maximum value', () => {
        const lit = DF.literal('2147483647', DF.namedNode(TypeURL.XSD_INT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(2_147_483_647);
      });

      it('creates NonLexicalLiteral for value below minimum', () => {
        const lit = DF.literal('-2147483649', DF.namedNode(TypeURL.XSD_INT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });

      it('creates NonLexicalLiteral for value above maximum', () => {
        const lit = DF.literal('2147483648', DF.namedNode(TypeURL.XSD_INT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });
    });

    describe('xsd:unsignedByte bounds (0 to 255)', () => {
      it('allows the minimum value', () => {
        const lit = DF.literal('0', DF.namedNode(TypeURL.XSD_UNSIGNED_BYTE));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(0);
      });

      it('allows the maximum value', () => {
        const lit = DF.literal('255', DF.namedNode(TypeURL.XSD_UNSIGNED_BYTE));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(255);
      });

      it('creates NonLexicalLiteral for negative value', () => {
        const lit = DF.literal('-1', DF.namedNode(TypeURL.XSD_UNSIGNED_BYTE));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });

      it('creates NonLexicalLiteral for value above maximum', () => {
        const lit = DF.literal('256', DF.namedNode(TypeURL.XSD_UNSIGNED_BYTE));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });
    });

    describe('xsd:unsignedShort bounds (0 to 65535)', () => {
      it('allows the minimum value', () => {
        const lit = DF.literal('0', DF.namedNode(TypeURL.XSD_UNSIGNED_SHORT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(0);
      });

      it('allows the maximum value', () => {
        const lit = DF.literal('65535', DF.namedNode(TypeURL.XSD_UNSIGNED_SHORT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(65_535);
      });

      it('creates NonLexicalLiteral for negative value', () => {
        const lit = DF.literal('-1', DF.namedNode(TypeURL.XSD_UNSIGNED_SHORT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });

      it('creates NonLexicalLiteral for value above maximum', () => {
        const lit = DF.literal('65536', DF.namedNode(TypeURL.XSD_UNSIGNED_SHORT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });
    });

    describe('xsd:unsignedInt bounds (0 to 4294967295)', () => {
      it('allows the minimum value', () => {
        const lit = DF.literal('0', DF.namedNode(TypeURL.XSD_UNSIGNED_INT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(0);
      });

      it('allows the maximum value', () => {
        const lit = DF.literal('4294967295', DF.namedNode(TypeURL.XSD_UNSIGNED_INT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(4_294_967_295);
      });

      it('creates NonLexicalLiteral for negative value', () => {
        const lit = DF.literal('-1', DF.namedNode(TypeURL.XSD_UNSIGNED_INT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });

      it('creates NonLexicalLiteral for value above maximum', () => {
        const lit = DF.literal('4294967296', DF.namedNode(TypeURL.XSD_UNSIGNED_INT));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });
    });

    describe('xsd:nonPositiveInteger bounds (-infinity to 0)', () => {
      it('allows zero', () => {
        const lit = DF.literal('0', DF.namedNode(TypeURL.XSD_NON_POSITIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(0);
      });

      it('allows negative values', () => {
        const lit = DF.literal('-100', DF.namedNode(TypeURL.XSD_NON_POSITIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(-100);
      });

      it('creates NonLexicalLiteral for positive value', () => {
        const lit = DF.literal('1', DF.namedNode(TypeURL.XSD_NON_POSITIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });
    });

    describe('xsd:negativeInteger bounds (-infinity to -1)', () => {
      it('allows negative values', () => {
        const lit = DF.literal('-100', DF.namedNode(TypeURL.XSD_NEGATIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(-100);
      });

      it('creates NonLexicalLiteral for zero', () => {
        const lit = DF.literal('0', DF.namedNode(TypeURL.XSD_NEGATIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });

      it('creates NonLexicalLiteral for positive value', () => {
        const lit = DF.literal('1', DF.namedNode(TypeURL.XSD_NEGATIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });
    });

    describe('xsd:nonNegativeInteger bounds (0 to infinity)', () => {
      it('allows zero', () => {
        const lit = DF.literal('0', DF.namedNode(TypeURL.XSD_NON_NEGATIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(0);
      });

      it('allows positive values', () => {
        const lit = DF.literal('100', DF.namedNode(TypeURL.XSD_NON_NEGATIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(100);
      });

      it('creates NonLexicalLiteral for negative value', () => {
        const lit = DF.literal('-1', DF.namedNode(TypeURL.XSD_NON_NEGATIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });
    });

    describe('xsd:positiveInteger bounds (1 to infinity)', () => {
      it('allows positive values', () => {
        const lit = DF.literal('100', DF.namedNode(TypeURL.XSD_POSITIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(100);
      });

      it('creates NonLexicalLiteral for zero', () => {
        const lit = DF.literal('0', DF.namedNode(TypeURL.XSD_POSITIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });

      it('creates NonLexicalLiteral for negative value', () => {
        const lit = DF.literal('-1', DF.namedNode(TypeURL.XSD_POSITIVE_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).toBeInstanceOf(NonLexicalLiteral);
      });
    });

    describe('xsd:integer (no specific bounds)', () => {
      it('allows large positive integer', () => {
        const lit = DF.literal('99999999999999', DF.namedNode(TypeURL.XSD_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(99_999_999_999_999);
      });

      it('allows large negative integer', () => {
        const lit = DF.literal('-99999999999999', DF.namedNode(TypeURL.XSD_INTEGER));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(-99_999_999_999_999);
      });
    });

    describe('xsd:decimal (no bounds)', () => {
      it('allows decimal values', () => {
        const lit = DF.literal('100.5', DF.namedNode(TypeURL.XSD_DECIMAL));
        const result = termTransformer.transformLiteral(lit);
        expect(result).not.toBeInstanceOf(NonLexicalLiteral);
        expect(result.typedValue).toBe(100.5);
      });
    });
  });
});
