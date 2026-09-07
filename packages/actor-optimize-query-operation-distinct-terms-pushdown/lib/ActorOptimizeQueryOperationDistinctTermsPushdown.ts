import type {
  IActionOptimizeQueryOperation,
  IActorOptimizeQueryOperationOutput,
} from '@comunica/bus-optimize-query-operation';
import { ActorOptimizeQueryOperation } from '@comunica/bus-optimize-query-operation';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';
import type { IQuerySourceWrapper } from '@comunica/types';
import { Algebra, AlgebraFactory, algebraUtils, isKnownOperation } from '@comunica/utils-algebra';
import { assignOperationSource, doesShapeAcceptOperation, getOperationSource } from '@comunica/utils-query-operation';
import type * as RDF from '@rdfjs/types';
import type { QuadTermName } from 'rdf-terms';
import { QUAD_TERM_NAMES } from 'rdf-terms';

/**
 * A comunica Distinct Terms Optimize Query Operation Actor.
 *
 * This actor rewrites SELECT DISTINCT queries to use the DistinctTerms operator
 * when querying a single source that supports it.
 */
export class ActorOptimizeQueryOperationDistinctTermsPushdown extends ActorOptimizeQueryOperation {
  public async test(_action: IActionOptimizeQueryOperation): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionOptimizeQueryOperation): Promise<IActorOptimizeQueryOperationOutput> {
    const dataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
    const algebraFactory = new AlgebraFactory(dataFactory);

    const operation = await algebraUtils.mapOperationAsync(action.operation, {
      [Algebra.Types.DISTINCT]: {
        preVisitor: () => ({ continue: false }),
        transform: async(operation: Algebra.Distinct) => {
          // Check if the Project wraps a Distinct Pattern
          let source: IQuerySourceWrapper | undefined;
          // If we have a JOIN with only one input, rewrite it to bring the sole JOIN child upwards one level.
          if (isKnownOperation(operation.input, Algebra.Types.PROJECT) &&
            isKnownOperation(operation.input.input, Algebra.Types.JOIN) &&
            operation.input.input.input.length === 1) {
            operation.input.input = operation.input.input.input[0];
          }
          if (!isKnownOperation(operation.input, Algebra.Types.PROJECT) ||
            !isKnownOperation(operation.input.input, Algebra.Types.PATTERN) ||
            // eslint-disable-next-line no-cond-assign
            !(source = getOperationSource(operation.input.input))) {
            return operation;
          }

          // Check if the projected variables can be mapped to quad terms
          const termsMapping = this.mapVariablesToTerms(operation.input.variables, operation.input.input);
          if (!termsMapping) {
            return operation;
          }

          // Create the DistinctTerms operator (replaces the entire DISTINCT(PROJECT(PATTERN))
          const distinctTermsOp = algebraFactory.createDistinctTerms(
            operation.input.variables,
            termsMapping,
            this.getTermFilters(operation.input.input),
          );

          // Check if the source supports this operation
          const shape = await source.source.getSelectorShape(
            source.context ? action.context.merge(source.context) : action.context,
          );
          if (!doesShapeAcceptOperation(shape, distinctTermsOp)) {
            return operation;
          }

          return assignOperationSource(distinctTermsOp, source);
        },
      },
    });

    return { operation, context: action.context };
  }

  /**
   * Map projected variables to quad term positions
   */
  private mapVariablesToTerms(
    variables: RDF.Variable[],
    pattern: Algebra.Pattern,
  ): Record<string, QuadTermName> | undefined {
    const termsMapping: Record<string, QuadTermName> = {};
    const termPositions: { term: RDF.Term; position: QuadTermName }[] = [
      { term: pattern.subject, position: 'subject' },
      { term: pattern.predicate, position: 'predicate' },
      { term: pattern.object, position: 'object' },
      { term: pattern.graph, position: 'graph' },
    ];

    // Map each projected variable to its position in the pattern
    for (const variable of variables) {
      let mapped = false;
      for (const { term, position } of termPositions) {
        if (term.termType === 'Variable' && term.equals(variable)) {
          termsMapping[variable.value] = position;
          mapped = true;
          break;
        }
      }
      // If a variable cannot be mapped, we cannot optimize
      if (!mapped) {
        return undefined;
      }
    }

    return termsMapping;
  }

  private getTermFilters(pattern: Algebra.Pattern): Partial<Record<QuadTermName, RDF.Term>> | undefined {
    const filters: Partial<Record<QuadTermName, RDF.Term>> = {};
    for (const quadTermName of QUAD_TERM_NAMES) {
      if (pattern[quadTermName].termType !== 'Variable') {
        filters[quadTermName] = pattern[quadTermName];
      }
    }
    return Object.keys(filters).length > 0 ? filters : undefined;
  }
}
