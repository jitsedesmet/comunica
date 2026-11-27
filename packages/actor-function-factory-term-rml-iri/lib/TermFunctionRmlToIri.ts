import { TermFunctionBase } from '@comunica/bus-function-factory';
import type { Term } from '@comunica/utils-expression-evaluator';
import { declare, NamedNode } from '@comunica/utils-expression-evaluator';
import { resolve } from 'relative-to-absolute-iri';
import { IriValidationStrategy, validateIri } from 'validate-iri';

/**
 * A function that resolves a value against a base IRI, and fails the query if the result is not a valid IRI.
 * It is the toIRI function of the RML algebra (https://arxiv.org/abs/2503.10385).
 */
export class TermFunctionRmlToIri extends TermFunctionBase {
  public static readonly FUNCTION_NAME = 'internal://rml/to-iri';

  public constructor() {
    super({
      arity: 2,
      operator: TermFunctionRmlToIri.FUNCTION_NAME,
      overloads: declare(TermFunctionRmlToIri.FUNCTION_NAME)
        .onBinary([ 'term', 'term' ], () => (value: Term, baseIRI: Term) =>
          new NamedNode(TermFunctionRmlToIri.toIri(value.str(), baseIRI.str())))
        .collect(),
    });
  }

  /**
   * Resolve a value against a base IRI.
   * @param value An absolute or relative IRI.
   * @param baseIRI The IRI to resolve a relative IRI against.
   * @return The absolute IRI.
   * @throws Error if the result is not a valid IRI, which is not an expression error, so that it fails the query.
   */
  public static toIri(value: string, baseIRI: string): string {
    let iri: string;
    try {
      iri = resolve(value, baseIRI);
    } catch {
      throw new Error(`The RML mapping generates the relative IRI '${value}', which requires a base IRI`);
    }
    if (validateIri(iri, IriValidationStrategy.Pragmatic)) {
      throw new Error(`The RML mapping generates the invalid IRI '${iri}'`);
    }
    return iri;
  }
}
