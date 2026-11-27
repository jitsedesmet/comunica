import { Bus } from '@comunica/core';
import { isExpressionError, NamedNode, StringLiteral } from '@comunica/utils-expression-evaluator';
import { getMockInternalEvaluator } from '@comunica/utils-jest';
import { ActorFunctionFactoryTermRmlIri, TermFunctionRmlEncodeForIri, TermFunctionRmlToIri } from '../lib';

describe('ActorFunctionFactoryTermRmlIri', () => {
  let actor: ActorFunctionFactoryTermRmlIri;
  const evaluator = getMockInternalEvaluator();

  beforeEach(() => {
    actor = new ActorFunctionFactoryTermRmlIri({ name: 'actor', bus: new Bus({ name: 'bus' }) });
  });

  describe('<internal://rml/to-iri>', () => {
    let toIri: TermFunctionRmlToIri;

    beforeEach(async() => {
      toIri = <TermFunctionRmlToIri> await actor.run(<any> { functionName: 'internal://rml/to-iri' });
    });

    it('should be created for its function name', () => {
      expect(toIri).toBeInstanceOf(TermFunctionRmlToIri);
    });

    it('should keep an absolute IRI', () => {
      expect(toIri.applyOnTerms([ new StringLiteral('http://example.org/a'), new StringLiteral('http://base.org/') ], evaluator))
        .toEqual(new NamedNode('http://example.org/a'));
    });

    it('should resolve a relative IRI against the base IRI', () => {
      expect(toIri.applyOnTerms([ new StringLiteral('a'), new NamedNode('http://base.org/') ], evaluator))
        .toEqual(new NamedNode('http://base.org/a'));
    });

    it('should fail the query on a relative IRI without base IRI', () => {
      expect(() => TermFunctionRmlToIri.toIri('a', ''))
        .toThrow(`The RML mapping generates the relative IRI 'a', which requires a base IRI`);
    });

    it('should fail the query on an invalid IRI', () => {
      let error: unknown;
      try {
        TermFunctionRmlToIri.toIri('Juan Daniel', 'http://base.org/');
      } catch (thrown: unknown) {
        error = thrown;
      }
      expect(error).toEqual(new Error(`The RML mapping generates the invalid IRI 'http://base.org/Juan Daniel'`));
      expect(isExpressionError(<Error> error)).toBe(false);
    });
  });

  describe('<internal://rml/encode-for-iri>', () => {
    let encodeForIri: TermFunctionRmlEncodeForIri;

    beforeEach(async() => {
      encodeForIri = <TermFunctionRmlEncodeForIri> await actor
        .run(<any> { functionName: 'internal://rml/encode-for-iri' });
    });

    it('should be created for its function name', () => {
      expect(encodeForIri).toBeInstanceOf(TermFunctionRmlEncodeForIri);
    });

    it('should percent-encode reserved characters, and keep unreserved and non-ASCII characters', () => {
      expect(encodeForIri.applyOnTerms([ new StringLiteral('Zoë Krüger/a-b_c.d~e?(1)') ], evaluator))
        .toEqual(new StringLiteral('Zoë%20Krüger%2Fa-b_c.d~e%3F%281%29'));
    });
  });
});
