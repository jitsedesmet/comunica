import { DataFactory } from 'rdf-data-factory';
import {
  ExpressionError,
  isExpressionError,
  ExtensionFunctionError,
  InvalidArgumentTypes,
  InvalidLexicalForm,
} from '../../../lib';

const DF = new DataFactory();

describe('Errors', () => {
  describe('isExpressionError', () => {
    it('on ExpressionError subclass', () => {
      expect(isExpressionError(new InvalidLexicalForm(DF.literal('foo')))).toBe(true);
    });

    it('on ExpressionError', () => {
      expect(isExpressionError(new ExpressionError('apple'))).toBe(true);
    });

    it('on plain Error', () => {
      expect(isExpressionError(new Error('foo'))).toBe(false);
    });
  });

  describe('ExpressionError', () => {
    it('should not capture a stack trace', () => {
      expect(new ExpressionError('apple').stack).toBe('Error: apple');
    });

    it('should restore the stack trace limit', () => {
      const stackTraceLimit = Error.stackTraceLimit;
      expect(new ExpressionError()).toBeInstanceOf(Error);
      expect(Error.stackTraceLimit).toBe(stackTraceLimit);
    });

    it('should have an empty message by default', () => {
      expect(new ExpressionError().message).toBe('');
    });

    it('should only describe its message once, when read', () => {
      const describeMessage = jest.fn(() => 'apple');
      const error = new ExpressionError(describeMessage);
      expect(describeMessage).not.toHaveBeenCalled();
      expect(error.message).toBe('apple');
      expect(error.message).toBe('apple');
      expect(describeMessage).toHaveBeenCalledTimes(1);
    });

    it('should keep its cause', () => {
      const cause = new Error('pear');
      expect(new ExpressionError('apple', { cause }).cause).toBe(cause);
    });

    it('should describe arguments that cannot be serialized to JSON', () => {
      expect(new InvalidArgumentTypes(<any> [ 1n ], '+').message)
        .toBe(`Argument types not valid for operator: '"+"' with '1`);
    });

    it('should allow overwriting its message', () => {
      const error = new ExpressionError('apple');
      error.message = 'pear';
      expect(error.message).toBe('pear');
    });
  });

  describe('ExtensionFunctionError', () => {
    it('with Error', () => {
      expect((new ExtensionFunctionError('test', new Error('error'))).message)
        .toContain('Error thrown in test: error');
    });

    it('with Error without backtrace', () => {
      const error = new Error('error');
      error.stack = undefined;
      expect((new ExtensionFunctionError('test', error)).message).toBe('Error thrown in test: error');
    });

    it('with other input', () => {
      expect((new ExtensionFunctionError('test', 'error')).message).toBe('Error thrown in test');
    });
  });
});
