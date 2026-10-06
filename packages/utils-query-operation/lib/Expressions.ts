import { Algebra, algebraUtils, isKnownSubType } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import { uniqTerms } from 'rdf-terms';
import { getPatternOrPathVariables } from './Variables';

/**
 * Get all variables inside the given expression.
 * @param expression An expression.
 * @return An array of variables, which can be empty.
 */
export function getExpressionVariables(expression: Algebra.Expression): RDF.Variable[] {
  if (isKnownSubType(expression, Algebra.ExpressionTypes.EXISTENCE)) {
    // The current solution is substituted into the whole pattern, including the expressions nested within it
    const variables = algebraUtils.inScopeVariables(expression.input);
    algebraUtils.visitOperation(expression.input, {
      [Algebra.Types.EXPRESSION]: { visitor: (nestedExpression) => {
        if (isKnownSubType(nestedExpression, Algebra.ExpressionTypes.TERM) &&
          nestedExpression.term.termType === 'Variable') {
          variables.push(nestedExpression.term);
        }
      } },
      [Algebra.Types.PATTERN]: { visitor: (pattern) => {
        variables.push(...getPatternOrPathVariables(pattern));
      } },
      [Algebra.Types.PATH]: { visitor: (path) => {
        variables.push(...getPatternOrPathVariables(path));
      } },
    });
    return uniqTerms(variables);
  }
  if (isKnownSubType(expression, Algebra.ExpressionTypes.NAMED) ||
    isKnownSubType(expression, Algebra.ExpressionTypes.OPERATOR)) {
    return uniqTerms(expression.args.flatMap(arg => getExpressionVariables(arg)));
  }
  if (isKnownSubType(expression, Algebra.ExpressionTypes.TERM)) {
    if (expression.term.termType === 'Variable') {
      return [ expression.term ];
    }
    return [];
  }
  throw new Error(`Getting expression variables is not supported for ${expression.subType}`);
}
