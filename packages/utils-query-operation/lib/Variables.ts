import type * as RDF from '@rdfjs/types';

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
