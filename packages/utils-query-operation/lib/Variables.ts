import { Algebra, algebraUtils } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import { uniqTerms } from 'rdf-terms';

/**
 * Get the variables that are bound in all results of the given operation.
 * This is a conservative approximation, so variables that are always bound may be omitted.
 * @param operation An operation.
 * @return An array of variables, which can be empty.
 */
export function getCertainlyBoundVariables(operation: Algebra.Operation): RDF.Variable[] {
  switch (operation.type) {
    case Algebra.Types.PATTERN:
    case Algebra.Types.PATH:
    case Algebra.Types.BGP:
      return algebraUtils.inScopeVariables(operation);
    case Algebra.Types.JOIN:
      return uniqTerms((<Algebra.Join> operation).input.flatMap(input => getCertainlyBoundVariables(input)));
    case Algebra.Types.LEFT_JOIN:
    case Algebra.Types.MINUS:
      return getCertainlyBoundVariables((<Algebra.LeftJoin | Algebra.Minus> operation).input[0]);
    case Algebra.Types.UNION: {
      const [ firstEntryVariables = [], ...otherEntriesVariables ] = (<Algebra.Union> operation).input
        .map(input => getCertainlyBoundVariables(input));
      const otherEntriesVariableNames = otherEntriesVariables
        .map(entryVariables => new Set(entryVariables.map(variable => variable.value)));
      return firstEntryVariables.filter(variable => otherEntriesVariableNames
        .every(entryVariableNames => entryVariableNames.has(variable.value)));
    }
    case Algebra.Types.FILTER:
    case Algebra.Types.EXTEND:
    case Algebra.Types.DISTINCT:
    case Algebra.Types.REDUCED:
    case Algebra.Types.ORDER_BY:
    case Algebra.Types.SLICE:
      return getCertainlyBoundVariables((<Algebra.Single> operation).input);
    case Algebra.Types.GRAPH: {
      const graph = <Algebra.Graph> operation;
      const inputVariables = getCertainlyBoundVariables(graph.input);
      return graph.name.termType === 'Variable' ? uniqTerms([ graph.name, ...inputVariables ]) : inputVariables;
    }
    case Algebra.Types.PROJECT: {
      const project = <Algebra.Project> operation;
      const projectedVariableNames = new Set(project.variables.map(variable => variable.value));
      return getCertainlyBoundVariables(project.input).filter(variable => projectedVariableNames.has(variable.value));
    }
    case Algebra.Types.VALUES: {
      const values = <Algebra.Values> operation;
      return values.variables
        .filter(variable => values.bindings.every(bindings => Object.hasOwn(bindings, variable.value)));
    }
  }
  return [];
}
