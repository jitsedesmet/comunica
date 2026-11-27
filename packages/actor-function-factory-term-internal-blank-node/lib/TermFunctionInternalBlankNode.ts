import { TermFunctionBase } from '@comunica/bus-function-factory';
import type { Term } from '@comunica/utils-expression-evaluator';
import { BlankNode, declare } from '@comunica/utils-expression-evaluator';

/**
 * A function that gives the same blank node for the same argument, unlike BNODE, which scopes it to a solution.
 * It follows the convention of https://github.com/jitsedesmet/sparql-view-unfold, limited to a single argument.
 */
export class TermFunctionInternalBlankNode extends TermFunctionBase {
  public static readonly FUNCTION_NAME = 'internal://blank';

  public constructor() {
    super({
      arity: 1,
      operator: TermFunctionInternalBlankNode.FUNCTION_NAME,
      overloads: declare(TermFunctionInternalBlankNode.FUNCTION_NAME)
        .onTerm1(() => (term: Term) =>
          new BlankNode(TermFunctionInternalBlankNode.getBlankNodeLabel(term.str())))
        .collect(),
    });
  }

  /**
   * Encode a string as a blank node label that every RDF serialization accepts.
   * @param value The string identifying the blank node.
   * @return A label that is unique for the given string.
   */
  public static getBlankNodeLabel(value: string): string {
    return `internal${value.replaceAll(/[^a-z0-9]/giu, character => `_${character.codePointAt(0)!.toString(16)}_`)}`;
  }
}
