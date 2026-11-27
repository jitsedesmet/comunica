import { TermFunctionBase } from '@comunica/bus-function-factory';
import type { Term } from '@comunica/utils-expression-evaluator';
import { declare, StringLiteral } from '@comunica/utils-expression-evaluator';

/**
 * The characters that are not unreserved in an IRI (iunreserved of RFC 3987).
 */
const IRI_RESERVED_CHARACTER =
  /[^\w\-.~\u{A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}\u{10000}-\u{EFFFD}]/gu;

/**
 * A function that percent-encodes the characters of a string that are not allowed everywhere in an IRI.
 * Unlike ENCODE_FOR_URI, it keeps non-ASCII characters.
 */
export class TermFunctionRmlEncodeForIri extends TermFunctionBase {
  public static readonly FUNCTION_NAME = 'internal://rml/encode-for-iri';

  public constructor() {
    super({
      arity: 1,
      operator: TermFunctionRmlEncodeForIri.FUNCTION_NAME,
      overloads: declare(TermFunctionRmlEncodeForIri.FUNCTION_NAME)
        .onTerm1(() => (value: Term) => new StringLiteral(TermFunctionRmlEncodeForIri.encodeForIri(value.str())))
        .collect(),
    });
  }

  /**
   * Percent-encode the characters that are not unreserved in an IRI.
   * @param value The string to encode.
   * @return The encoded string, which can be used in any part of an IRI.
   */
  public static encodeForIri(value: string): string {
    return value.replaceAll(IRI_RESERVED_CHARACTER, character => [ ...new TextEncoder().encode(character) ]
      .map(byte => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join(''));
  }
}
