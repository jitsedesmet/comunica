import { Algebra, isKnownOperation } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import { getTermsNested, getVariables, uniqTerms } from 'rdf-terms';

/**
 * Check if the two given lists of variables have at least one variable in common.
 * @param variablesA A list of variables.
 * @param variablesB A list of variables.
 * @return If the lists overlap.
 */
export function variablesIntersect(variablesA: RDF.Variable[], variablesB: RDF.Variable[]): boolean {
  return variablesA.some(variableA => variablesB.some(variableB => variableA.equals(variableB)));
}

/**
 * Check if all variables of the first list are included in the second list.
 * @param variables The variables to search for.
 * @param otherVariables The variables to search in, which may also contain other variables.
 * @return If the first list is a subset of the second list.
 */
export function variablesSubsetOf(variables: RDF.Variable[], otherVariables: RDF.Variable[]): boolean {
  return variables.every(variable => otherVariables.some(otherVariable => variable.equals(otherVariable)));
}

/**
 * Get the variables that are bound in every solution of the given operation.
 * Unlike in-scope variables, this excludes variables that may be left unbound, such as those within OPTIONAL.
 * @param operation An operation.
 * @return The certainly bound variables, which may be an underestimation for unknown operations.
 */
export function getCertainlyBoundVariables(operation: Algebra.Operation): RDF.Variable[] {
  if (isKnownOperation(operation, Algebra.Types.PATTERN)) {
    return uniqTerms(getVariables(getTermsNested(operation)));
  }
  if (isKnownOperation(operation, Algebra.Types.PATH)) {
    return uniqTerms(getVariables([ operation.subject, operation.object, operation.graph ]));
  }
  if (isKnownOperation(operation, Algebra.Types.BGP)) {
    return uniqTerms(operation.patterns.flatMap(pattern => getCertainlyBoundVariables(pattern)));
  }
  if (isKnownOperation(operation, Algebra.Types.JOIN)) {
    return uniqTerms(operation.input.flatMap(input => getCertainlyBoundVariables(input)));
  }
  if (isKnownOperation(operation, Algebra.Types.UNION)) {
    const [ firstInput, ...otherInputs ] = operation.input.map(input => getCertainlyBoundVariables(input));
    return otherInputs.reduce((intersection, variables) => intersection
      .filter(variable => variablesIntersect([ variable ], variables)), firstInput ?? []);
  }
  if (isKnownOperation(operation, Algebra.Types.LEFT_JOIN) || isKnownOperation(operation, Algebra.Types.MINUS)) {
    return getCertainlyBoundVariables(operation.input[0]);
  }
  if (isKnownOperation(operation, Algebra.Types.PROJECT) || isKnownOperation(operation, Algebra.Types.GROUP)) {
    return getCertainlyBoundVariables(operation.input)
      .filter(variable => variablesIntersect([ variable ], operation.variables));
  }
  if (isKnownOperation(operation, Algebra.Types.GRAPH)) {
    return uniqTerms([ ...getCertainlyBoundVariables(operation.input), ...getVariables([ operation.name ]) ]);
  }
  if (isKnownOperation(operation, Algebra.Types.VALUES)) {
    return operation.variables.filter(variable => operation.bindings.every(binding => binding[variable.value]));
  }
  // The variable of an extend is unbound if its expression errors, and a failing silent service yields no bindings
  if (isKnownOperation(operation, Algebra.Types.FILTER) ||
    isKnownOperation(operation, Algebra.Types.EXTEND) ||
    isKnownOperation(operation, Algebra.Types.DISTINCT) ||
    isKnownOperation(operation, Algebra.Types.REDUCED) ||
    isKnownOperation(operation, Algebra.Types.ORDER_BY) ||
    isKnownOperation(operation, Algebra.Types.SLICE) ||
    isKnownOperation(operation, Algebra.Types.FROM) ||
    (isKnownOperation(operation, Algebra.Types.SERVICE) && !operation.silent)) {
    return getCertainlyBoundVariables(operation.input);
  }
  return [];
}
