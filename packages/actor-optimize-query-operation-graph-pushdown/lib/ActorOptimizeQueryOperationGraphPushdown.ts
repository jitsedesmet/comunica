import type {
  IActionOptimizeQueryOperation,
  IActorOptimizeQueryOperationOutput,
} from '@comunica/bus-optimize-query-operation';
import { ActorOptimizeQueryOperation } from '@comunica/bus-optimize-query-operation';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';
import { Algebra, AlgebraFactory, algebraUtils, isKnownOperation } from '@comunica/utils-algebra';
import { scopeOperationToGraph } from '@comunica/utils-query-operation';
import type * as RDF from '@rdfjs/types';
import { someTermsNested } from 'rdf-terms';

/**
 * How the solutions of an operation depend on the graph that its quad patterns are matched against.
 * - `matching`: every solution matches at least one quad of that graph.
 * - `independent`: the solutions are the same for every graph.
 * - `unknown`: none of the above could be derived.
 */
export type ActiveGraphDependence = 'matching' | 'independent' | 'unknown';

/**
 * A comunica Graph Pushdown Optimize Query Operation Actor.
 *
 * It pushes GRAPH operations into the quad patterns and property paths of their input,
 * if this gives the same solutions as evaluating that input over every matching named graph separately.
 */
export class ActorOptimizeQueryOperationGraphPushdown extends ActorOptimizeQueryOperation {
  public async test(_action: IActionOptimizeQueryOperation): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionOptimizeQueryOperation): Promise<IActorOptimizeQueryOperationOutput> {
    if (!algebraUtils.hasOperationType(action.operation, [ Algebra.Types.GRAPH ])) {
      return { operation: action.operation, context: action.context };
    }
    const algebraFactory = new AlgebraFactory(action.context.getSafe(KeysInitQuery.dataFactory));

    // Nested GRAPH operations are handled first, so each GRAPH operation only sees the ones that could not be pushed.
    const operation = algebraUtils.mapOperation(action.operation, {
      [Algebra.Types.GRAPH]: {
        transform: graph =>
          ActorOptimizeQueryOperationGraphPushdown.getActiveGraphDependence(graph.input, graph.name) === 'matching' ?
            scopeOperationToGraph(graph.input, graph.name, algebraFactory) :
            graph,
      },
    });
    return { operation, context: action.context };
  }

  /**
   * Derive how the solutions of an operation depend on the graph that a surrounding GRAPH operation selects.
   * A GRAPH operation can only be pushed into a `matching` input:
   * its solutions exist for existing graphs only, and all bind a graph variable once it is pushed into the patterns.
   * @param operation The (indirect) input of a GRAPH operation.
   * @param graphName The name of that GRAPH operation.
   * @return The dependence of the operation on the selected graph.
   */
  public static getActiveGraphDependence(
    operation: Algebra.Operation,
    graphName: RDF.Variable | RDF.NamedNode,
  ): ActiveGraphDependence {
    const dependenceOf = (subOperation: Algebra.Operation): ActiveGraphDependence =>
      ActorOptimizeQueryOperationGraphPushdown.getActiveGraphDependence(subOperation, graphName);
    const isDefaultGraph = (graph: RDF.Term): boolean => graph.termType === 'DefaultGraph';
    // A graph variable is only bound after evaluating the GRAPH operation,
    // which expressions and optional solutions that use this variable could observe.
    const isGraphVariable = graphName.termType === 'Variable';
    const usesGraphVariable = (value: unknown): boolean => isGraphVariable &&
      ActorOptimizeQueryOperationGraphPushdown.containsVariable(value, graphName);

    if (isKnownOperation(operation, Algebra.Types.PATTERN)) {
      return isDefaultGraph(operation.graph) ? 'matching' : 'independent';
    }
    if (isKnownOperation(operation, Algebra.Types.PATH)) {
      if (!isDefaultGraph(operation.graph)) {
        return 'independent';
      }
      // Zero-length paths can have solutions that match no quad at all.
      return algebraUtils.hasOperationType(
        operation.predicate,
        [ Algebra.Types.ZERO_OR_MORE_PATH, Algebra.Types.ZERO_OR_ONE_PATH ],
      ) ?
        'unknown' :
        'matching';
    }
    if (isKnownOperation(operation, Algebra.Types.BGP)) {
      return operation.patterns.some(pattern => isDefaultGraph(pattern.graph)) ? 'matching' : 'independent';
    }
    if (isKnownOperation(operation, Algebra.Types.VALUES) ||
      isKnownOperation(operation, Algebra.Types.GRAPH) ||
      isKnownOperation(operation, Algebra.Types.SERVICE)) {
      return 'independent';
    }
    if (isKnownOperation(operation, Algebra.Types.JOIN)) {
      // Matching entries join on the graph, while independent entries are joined with every graph.
      const dependences = new Set(operation.input.map(dependenceOf));
      if (dependences.has('unknown')) {
        return 'unknown';
      }
      return dependences.has('matching') ? 'matching' : 'independent';
    }
    if (isKnownOperation(operation, Algebra.Types.UNION)) {
      const dependences = new Set(operation.input.map(dependenceOf));
      return dependences.size === 1 ? [ ...dependences ][0] : 'unknown';
    }
    if (isKnownOperation(operation, Algebra.Types.LEFT_JOIN)) {
      const [ left, right ] = operation.input.map(dependenceOf);
      // An optional side that matches the graph would bind the graph variable of only some solutions.
      if (right === 'unknown' || (left === 'independent' && right === 'matching') ||
        usesGraphVariable([ operation.input[1], operation.expression ])) {
        return 'unknown';
      }
      return left;
    }
    if (isKnownOperation(operation, Algebra.Types.FILTER)) {
      return usesGraphVariable(operation.expression) ? 'unknown' : dependenceOf(operation.input);
    }
    if (isKnownOperation(operation, Algebra.Types.EXTEND)) {
      return usesGraphVariable([ operation.variable, operation.expression ]) ?
        'unknown' :
        dependenceOf(operation.input);
    }

    // The remaining operations are scoped to solutions as a whole, which differ between one and all graphs.
    if (isGraphVariable) {
      return 'unknown';
    }
    if (isKnownOperation(operation, Algebra.Types.PROJECT) ||
      isKnownOperation(operation, Algebra.Types.DISTINCT) ||
      isKnownOperation(operation, Algebra.Types.REDUCED) ||
      isKnownOperation(operation, Algebra.Types.ORDER_BY) ||
      isKnownOperation(operation, Algebra.Types.SLICE)) {
      return dependenceOf(operation.input);
    }
    if (isKnownOperation(operation, Algebra.Types.MINUS)) {
      return dependenceOf(operation.input[0]) === 'matching' ? 'matching' : 'unknown';
    }
    if (isKnownOperation(operation, Algebra.Types.GROUP)) {
      // Without grouping variables, a group has a solution even if its input has none.
      return operation.variables.length > 0 ? dependenceOf(operation.input) : 'unknown';
    }
    return 'unknown';
  }

  /**
   * Check if a variable occurs anywhere in a value, including in the operations of EXISTS expressions.
   * @param value An operation, a term, or any value nested in an operation.
   * @param variable The variable to look for.
   * @return If the variable was found.
   */
  public static containsVariable(value: unknown, variable: RDF.Variable): boolean {
    if (value === null || typeof value !== 'object') {
      return false;
    }
    if ('termType' in value) {
      const term = <RDF.Term> value;
      return term.termType === 'Quad' ?
        someTermsNested(term, nestedTerm => nestedTerm.equals(variable)) :
        term.equals(variable);
    }
    return Object.entries(value).some(([ key, child ]) => key !== 'metadata' &&
      ActorOptimizeQueryOperationGraphPushdown.containsVariable(child, variable));
  }
}
