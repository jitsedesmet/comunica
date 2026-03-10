import { KeysExpressionEvaluator } from '@comunica/context-entries';
import { ActionContext } from '@comunica/core';
import { getMockSuperTypeProvider } from '@comunica/utils-expression-evaluator/test/util/helpers';
import { DataFactory } from 'rdf-data-factory';
import { InvalidLiteralBoundBehavior, NonLexicalLiteral, TermTransformer, TypeURL } from '../../../lib';

const DF = new DataFactory();

describe('Integration test for Bound Checking with Context', () => {
  it('should use IGNORE behavior from context by default', () => {
    const context = new ActionContext({});
    const superTypeProvider = getMockSuperTypeProvider();
    const boundBehavior = context.get(KeysExpressionEvaluator.invalidLiteralBoundBehavior) === 'error' ?
      InvalidLiteralBoundBehavior.ERROR :
      InvalidLiteralBoundBehavior.IGNORE;

    const termTransformer = new TermTransformer(superTypeProvider, boundBehavior);
    const lit = DF.literal('200', DF.namedNode(TypeURL.XSD_BYTE));
    const result = termTransformer.transformLiteral(lit);

    // With IGNORE, out-of-bounds values are accepted
    expect(result).not.toBeInstanceOf(NonLexicalLiteral);
    expect(result.typedValue).toBe(200);
  });

  it('should use ERROR behavior when set in context', () => {
    const context = new ActionContext({
      [KeysExpressionEvaluator.invalidLiteralBoundBehavior.name]: 'error',
    });
    const superTypeProvider = getMockSuperTypeProvider();
    const boundBehavior = context.get(KeysExpressionEvaluator.invalidLiteralBoundBehavior) === 'error' ?
      InvalidLiteralBoundBehavior.ERROR :
      InvalidLiteralBoundBehavior.IGNORE;

    const termTransformer = new TermTransformer(superTypeProvider, boundBehavior);
    const lit = DF.literal('200', DF.namedNode(TypeURL.XSD_BYTE));
    const result = termTransformer.transformLiteral(lit);

    // With ERROR, out-of-bounds values create NonLexicalLiteral
    expect(result).toBeInstanceOf(NonLexicalLiteral);
  });

  it('should accept in-bounds value with ERROR behavior', () => {
    const context = new ActionContext({
      [KeysExpressionEvaluator.invalidLiteralBoundBehavior.name]: 'error',
    });
    const superTypeProvider = getMockSuperTypeProvider();
    const boundBehavior = context.get(KeysExpressionEvaluator.invalidLiteralBoundBehavior) === 'error' ?
      InvalidLiteralBoundBehavior.ERROR :
      InvalidLiteralBoundBehavior.IGNORE;

    const termTransformer = new TermTransformer(superTypeProvider, boundBehavior);
    const lit = DF.literal('100', DF.namedNode(TypeURL.XSD_BYTE));
    const result = termTransformer.transformLiteral(lit);

    // In-bounds values are always accepted
    expect(result).not.toBeInstanceOf(NonLexicalLiteral);
    expect(result.typedValue).toBe(100);
  });

  describe('Different integer types with ERROR behavior', () => {
    let termTransformer: TermTransformer;

    beforeEach(() => {
      const context = new ActionContext({
        [KeysExpressionEvaluator.invalidLiteralBoundBehavior.name]: 'error',
      });
      const superTypeProvider = getMockSuperTypeProvider();
      const boundBehavior = context.get(KeysExpressionEvaluator.invalidLiteralBoundBehavior) === 'error' ?
        InvalidLiteralBoundBehavior.ERROR :
        InvalidLiteralBoundBehavior.IGNORE;
      termTransformer = new TermTransformer(superTypeProvider, boundBehavior);
    });

    it('should handle xsd:short bounds correctly', () => {
      const validLit = DF.literal('30000', DF.namedNode(TypeURL.XSD_SHORT));
      const validResult = termTransformer.transformLiteral(validLit);
      expect(validResult).not.toBeInstanceOf(NonLexicalLiteral);
      expect(validResult.typedValue).toBe(30_000);

      const invalidLit = DF.literal('40000', DF.namedNode(TypeURL.XSD_SHORT));
      const invalidResult = termTransformer.transformLiteral(invalidLit);
      expect(invalidResult).toBeInstanceOf(NonLexicalLiteral);
    });

    it('should handle xsd:int bounds correctly', () => {
      const validLit = DF.literal('2000000000', DF.namedNode(TypeURL.XSD_INT));
      const validResult = termTransformer.transformLiteral(validLit);
      expect(validResult).not.toBeInstanceOf(NonLexicalLiteral);
      expect(validResult.typedValue).toBe(2_000_000_000);

      const invalidLit = DF.literal('3000000000', DF.namedNode(TypeURL.XSD_INT));
      const invalidResult = termTransformer.transformLiteral(invalidLit);
      expect(invalidResult).toBeInstanceOf(NonLexicalLiteral);
    });

    it('should handle xsd:unsignedByte bounds correctly', () => {
      const validLit = DF.literal('200', DF.namedNode(TypeURL.XSD_UNSIGNED_BYTE));
      const validResult = termTransformer.transformLiteral(validLit);
      expect(validResult).not.toBeInstanceOf(NonLexicalLiteral);
      expect(validResult.typedValue).toBe(200);

      const invalidLit = DF.literal('256', DF.namedNode(TypeURL.XSD_UNSIGNED_BYTE));
      const invalidResult = termTransformer.transformLiteral(invalidLit);
      expect(invalidResult).toBeInstanceOf(NonLexicalLiteral);
    });

    it('should handle xsd:positiveInteger bounds correctly', () => {
      const validLit = DF.literal('100', DF.namedNode(TypeURL.XSD_POSITIVE_INTEGER));
      const validResult = termTransformer.transformLiteral(validLit);
      expect(validResult).not.toBeInstanceOf(NonLexicalLiteral);
      expect(validResult.typedValue).toBe(100);

      const invalidLit = DF.literal('0', DF.namedNode(TypeURL.XSD_POSITIVE_INTEGER));
      const invalidResult = termTransformer.transformLiteral(invalidLit);
      expect(invalidResult).toBeInstanceOf(NonLexicalLiteral);
    });
  });
});
