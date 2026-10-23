import type {
  IActionOptimizeQueryOperation,
  IActorOptimizeQueryOperationArgs,
  IActorOptimizeQueryOperationOutput,
} from '@comunica/bus-optimize-query-operation';
import { ActorOptimizeQueryOperation } from '@comunica/bus-optimize-query-operation';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';
import type { ComunicaDataFactory, FragmentSelectorShape, IActionContext, IQuerySourceWrapper } from '@comunica/types';
import {
  AlgebraFactory,
  Algebra,
  algebraUtils,
  isKnownOperation,
  isKnownSubType,
} from '@comunica/utils-algebra';
import {
  doesShapeAcceptOperation,
  getCertainlyBoundVariables,
  getExpressionVariables,
  getOperationSource,
} from '@comunica/utils-query-operation';
import type * as RDF from '@rdfjs/types';
import { mapTermsNested } from 'rdf-terms';

const XSD_BOOLEAN = 'http://www.w3.org/2001/XMLSchema#boolean';

/**
 * A comunica Filter Pushdown Optimize Query Operation Actor.
 */
export class ActorOptimizeQueryOperationFilterPushdown extends ActorOptimizeQueryOperation {
  private readonly aggressivePushdown: boolean;
  private readonly maxIterations: number;
  private readonly splitConjunctive: boolean;
  private readonly mergeConjunctive: boolean;
  private readonly pushIntoLeftJoins: boolean;
  private readonly pushEqualityIntoPatterns: boolean;

  public constructor(args: IActorOptimizeQueryOperationFilterPushdownArgs) {
    super(args);
    this.aggressivePushdown = args.aggressivePushdown;
    this.maxIterations = args.maxIterations;
    this.splitConjunctive = args.splitConjunctive;
    this.mergeConjunctive = args.mergeConjunctive;
    this.pushIntoLeftJoins = args.pushIntoLeftJoins;
    this.pushEqualityIntoPatterns = args.pushEqualityIntoPatterns;
  }

  public async test(_action: IActionOptimizeQueryOperation): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionOptimizeQueryOperation): Promise<IActorOptimizeQueryOperationOutput> {
    const dataFactory: ComunicaDataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
    const algebraFactory = new AlgebraFactory(dataFactory);
    let operation: Algebra.Operation = action.operation;

    // Split conjunctive filters into nested filters
    if (this.splitConjunctive) {
      operation = algebraUtils.mapOperation(operation, {
        [Algebra.Types.FILTER]: { transform: (filterOp) => {
          // Split conjunctive filters into separate filters
          if (isKnownSubType(filterOp.expression, Algebra.ExpressionTypes.OPERATOR) &&
            filterOp.expression.operator === '&&') {
            this.logDebug(action.context, `Split conjunctive filter into ${filterOp.expression.args.length} nested filters`);
            return filterOp.expression.args
              .reduce((operation, expression) => algebraFactory.createFilter(operation, expression), filterOp.input);
          }
          return filterOp;
        } },
      });
    }

    // Collect selector shapes of all operations
    const sources = this.getSources(operation);
    // eslint-disable-next-line ts/no-unnecessary-type-assertion
    const sourceShapes = new Map(<[IQuerySourceWrapper, FragmentSelectorShape][]> await Promise.all(sources
      .map(async source => [
        source,
        await source.source.getSelectorShape(source.context ? action.context.merge(source.context) : action.context),
      ])));

    // Push down all filters
    // We loop until no more filters can be pushed down.
    let repeat = true;
    let iterations = 0;
    while (repeat && iterations < this.maxIterations) {
      repeat = false;
      operation = algebraUtils.mapOperation(operation, {
        [Algebra.Types.FILTER]: { transform: (filterOp) => {
          // Check if the filter must be pushed down
          const extensionFunctions = action.context.get(KeysInitQuery.extensionFunctions);
          const extensionFunctionsAlwaysPushdown = action.context.get(KeysInitQuery.extensionFunctionsAlwaysPushdown);
          if (!this.shouldAttemptPushDown(
            filterOp,
            sources,
            sourceShapes,
            extensionFunctions,
            extensionFunctionsAlwaysPushdown,
          )) {
            return filterOp;
          }

          // For all filter expressions in the operation,
          // we attempt to push them down as deep as possible into the algebra.
          const variables = getExpressionVariables(filterOp.expression);
          const [ isModified, result ] = this
            .filterPushdown(filterOp.expression, variables, filterOp.input, algebraFactory, action.context);
          if (isModified) {
            repeat = true;
          }
          return result;
        } },
      });
      iterations++;
    }

    if (iterations > 1) {
      this.logDebug(action.context, `Pushed down filters in ${iterations} iterations`);
    }

    // Merge nested filters into conjunctive filters
    if (this.mergeConjunctive) {
      operation = algebraUtils.mapOperation(operation, {
        [Algebra.Types.FILTER]: { transform: (op) => {
          if (op.input.type === Algebra.Types.FILTER) {
            const { nestedExpressions, input } = this.getNestedFilterExpressions(op);
            this.logDebug(action.context, `Merge ${nestedExpressions.length} nested filters into conjunctive filter`);
            return algebraFactory.createFilter(
              input,
              nestedExpressions.slice(1).reduce((previous, current) =>
                algebraFactory.createOperatorExpression('&&', [ previous, current ]), nestedExpressions[0]),
            );
          }
          return op;
        } },
      });
    }

    return { operation, context: action.context };
  }

  /**
   * Check if the given filter operation must be attempted to push down, based on the following criteria:
   * - Always push down if aggressive mode is enabled
   * - Push down if the filter is extremely selective
   * - Don't push down extension functions comunica support, but a source does not
   * - Push down if federated and at least one accepts the filter
   * @param operation The filter operation
   * @param sources The query sources in the operation
   * @param sourceShapes A mapping of sources to selector shapes.
   * @param extensionFunctions The extension functions comunica supports.
   * @param extensionFunctionsAlwaysPushdown If extension functions must always be pushed down to sources that support
   *                                         expressions, even if those sources to not explicitly declare support for
   *                                         these extension functions.
   */
  public shouldAttemptPushDown(
    operation: Algebra.Filter,
    sources: IQuerySourceWrapper[],
    sourceShapes: Map<IQuerySourceWrapper, FragmentSelectorShape>,
    extensionFunctions?: Record<string, any>,
    extensionFunctionsAlwaysPushdown?: boolean,
  ): boolean {
    // Always push down if aggressive mode is enabled
    if (this.aggressivePushdown) {
      return true;
    }

    // Push down if the filter is extremely selective
    const expression = operation.expression;
    if (isKnownSubType(expression, Algebra.ExpressionTypes.OPERATOR) && expression.operator === '=' &&
      ((isKnownSubType(expression.args[0], Algebra.ExpressionTypes.TERM) &&
          expression.args[0].term.termType !== 'Variable' &&
          isKnownSubType(expression.args[1], Algebra.ExpressionTypes.TERM) &&
          expression.args[1].term.termType === 'Variable') ||
        (isKnownSubType(expression.args[0], Algebra.ExpressionTypes.TERM) &&
          expression.args[0].term.termType === 'Variable' &&
          isKnownSubType(expression.args[1], Algebra.ExpressionTypes.TERM) &&
          expression.args[1].term.termType !== 'Variable'))) {
      return true;
    }

    // Don't push down extension functions comunica support, but no source does
    if (extensionFunctions && isKnownSubType(expression, Algebra.ExpressionTypes.NAMED) &&
        expression.name.value in extensionFunctions &&
        // Checks if there's not a single source that supports the extension function
        !sources.some(source =>
          doesShapeAcceptOperation(sourceShapes.get(source)!, expression))
    ) {
      return false;
    }

    // Push down if federated and at least one accepts the filter
    if (sources.some(source => doesShapeAcceptOperation(sourceShapes.get(source)!, operation, {
      wildcardAcceptAllExtensionFunctions: extensionFunctionsAlwaysPushdown,
    }))) {
      return true;
    }

    // Don't push down in all other cases
    return false;
  }

  /**
   * Collected all sources that are defined within the given operation of children recursively.
   * @param operation An operation.
   */
  public getSources(operation: Algebra.Operation): IQuerySourceWrapper[] {
    const sources = new Set<IQuerySourceWrapper>();
    const sourceAdder = (subOperation: Algebra.Operation): boolean => {
      const src = getOperationSource(subOperation);
      if (src) {
        sources.add(src);
      }
      return false;
    };
    algebraUtils.visitOperation(operation, {
      [Algebra.Types.PATTERN]: { visitor: sourceAdder },
      [Algebra.Types.SERVICE]: { visitor: sourceAdder },
      [Algebra.Types.LINK]: { visitor: sourceAdder },
      [Algebra.Types.NPS]: { visitor: sourceAdder },
    });
    return [ ...sources ];
  }

  /**
   * Check if the given operation contains a SERVICE clause of which the target is a variable.
   * Such clauses can only be evaluated once a bind-join has bound their target,
   * so they must remain direct entries of their join.
   * @param operation An operation.
   */
  public static hasVariableServiceTarget(operation: Algebra.Operation): boolean {
    let found = false;
    algebraUtils.visitOperation(operation, {
      [Algebra.Types.SERVICE]: {
        preVisitor: (serviceOperation) => {
          if (serviceOperation.name.termType === 'Variable') {
            found = true;
            return { shortcut: true };
          }
          return {};
        },
      },
    });
    return found;
  }

  /**
   * Group the entries of a join by how they overlap with the variables of an expression.
   * An entry overlaps fully if it determines the value of each variable in the join's results,
   * because it certainly binds the variable, or because no other entry can bind it.
   * @param operation A join operation.
   * @param expressionVariables The variables inside an expression.
   * @return The fully, partially, and not overlapping join entries.
   */
  protected getOverlappingOperations(
    operation: Algebra.Join,
    expressionVariables: RDF.Variable[],
  ): {
      fullyOverlapping: Algebra.Operation[];
      partiallyOverlapping: Algebra.Operation[];
      notOverlapping: Algebra.Operation[];
    } {
    const entriesVariables = operation.input.map(input => algebraUtils.inScopeVariables(input));
    const entryCountPerVariableName = new Map<string, number>();
    for (const variable of entriesVariables.flat()) {
      entryCountPerVariableName.set(variable.value, (entryCountPerVariableName.get(variable.value) ?? 0) + 1);
    }

    const fullyOverlapping: Algebra.Operation[] = [];
    const partiallyOverlapping: Algebra.Operation[] = [];
    const notOverlapping: Algebra.Operation[] = [];
    for (const [ entryIndex, input ] of operation.input.entries()) {
      const entryVariableNames = new Set(entriesVariables[entryIndex].map(variable => variable.value));
      if (expressionVariables.length > 0 &&
        !expressionVariables.some(variable => entryVariableNames.has(variable.value))) {
        notOverlapping.push(input);
        continue;
      }

      let certainlyBoundVariableNames: Set<string> | undefined;
      const determinesVariable = (variable: RDF.Variable): boolean => {
        const entryCount = entryCountPerVariableName.get(variable.value) ?? 0;
        if (entryCount === 0 || (entryCount === 1 && entryVariableNames.has(variable.value))) {
          return true;
        }
        certainlyBoundVariableNames ??= new Set(getCertainlyBoundVariables(input).map(bound => bound.value));
        return certainlyBoundVariableNames.has(variable.value);
      };
      if (expressionVariables.every(determinesVariable)) {
        fullyOverlapping.push(input);
      } else {
        partiallyOverlapping.push(input);
      }
    }

    return {
      fullyOverlapping,
      partiallyOverlapping,
      notOverlapping,
    };
  }

  /**
   * Recursively push down the given expression into the given operation if possible.
   * Different operators have different semantics for choosing whether or not to push down,
   * and how this pushdown is done.
   * @param expression An expression to push down.
   * @param expressionVariables The variables inside the given expression.
   * @param operation The operation to push down into.
   * @param factory An algebra factory.
   * @param context The action context.
   * @return A tuple indicating if the operation was modified and the modified operation.
   */
  public filterPushdown(
    expression: Algebra.Expression,
    expressionVariables: RDF.Variable[],
    operation: Algebra.Operation,
    factory: AlgebraFactory,
    context: IActionContext,
  ): [ boolean, Algebra.Operation ] {
    // Void false expressions
    if (this.isExpressionFalse(expression)) {
      return [ true, factory.createUnion([]) ];
    }

    // Don't push down (NOT) EXISTS
    if (isKnownOperation(expression, Algebra.Types.EXPRESSION, Algebra.ExpressionTypes.EXISTENCE)) {
      return [ false, factory.createFilter(operation, expression) ];
    }

    if (isKnownOperation(operation, Algebra.Types.EXTEND)) {
      // Pass if the variable is not part of the expression
      if (!this.variablesIntersect([ operation.variable ], expressionVariables)) {
        return [ true, factory.createExtend(
          this.filterPushdown(expression, expressionVariables, operation.input, factory, context)[1],
          operation.variable,
          operation.expression,
        ) ];
      }
      return [ false, factory.createFilter(operation, expression) ];
    }
    if (isKnownOperation(operation, Algebra.Types.FILTER)) {
      // Always pass
      const [ isModified, result ] = this
        .filterPushdown(expression, expressionVariables, operation.input, factory, context);
      return [ isModified, factory.createFilter(result, operation.expression) ];
    }
    if (isKnownOperation(operation, Algebra.Types.JOIN)) {
      // Don't push down into an entry that must be bound by this join, such as a SERVICE clause with a variable
      // target. Wrapping such an entry in a filter would leave no join actor able to bind it.
      if (operation.input
        .some(input => ActorOptimizeQueryOperationFilterPushdown.hasVariableServiceTarget(input))) {
        return [ false, factory.createFilter(operation, expression) ];
      }

      // Determine overlapping operations
      const {
        fullyOverlapping,
        partiallyOverlapping,
        notOverlapping,
      } = this.getOverlappingOperations(operation, expressionVariables);

      // Don't push down if no entry binds any of the variables, as they would then always be unbound
      if (fullyOverlapping.length === 0 && partiallyOverlapping.length === 0) {
        return [ false, factory.createFilter(operation, expression) ];
      }

      // Filtering the fully overlapping entries is sufficient, so the other entries can remain unfiltered
      const joins: Algebra.Operation[] = fullyOverlapping.length > 0 ?
          [
            ...fullyOverlapping
              .map(input => this.filterPushdown(expression, expressionVariables, input, factory, context)[1]),
            ...partiallyOverlapping,
            ...notOverlapping,
          ] :
          [
            factory.createFilter(factory.createJoin(partiallyOverlapping, false), expression),
            ...notOverlapping,
          ];
      const isModified = fullyOverlapping.length > 0 || notOverlapping.length > 0;
      if (isModified) {
        this.logDebug(context, `Push down filter across join entries with ${fullyOverlapping.length} fully overlapping, ${partiallyOverlapping.length} partially overlapping, and ${notOverlapping.length} not overlapping`);
      }

      return [ isModified, joins.length === 1 ? joins[0] : factory.createJoin(joins) ];
    }
    if (isKnownOperation(operation, Algebra.Types.PROJECT)) {
      // Push down if all variables are projected, as the others are always unbound outside the projection
      if (this.variablesSubSetOf(expressionVariables, operation.variables)) {
        return [ true, factory.createProject(
          this.filterPushdown(expression, expressionVariables, operation.input, factory, context)[1],
          operation.variables,
        ) ];
      }
      return [ false, factory.createFilter(operation, expression) ];
    }
    if (isKnownOperation(operation, Algebra.Types.UNION)) {
      if (operation.input
        .some(input => ActorOptimizeQueryOperationFilterPushdown.hasVariableServiceTarget(input))) {
        return [ false, factory.createFilter(operation, expression) ];
      }

      // Push down into all entries, including the ones that don't bind the variables,
      // as the filter must also be evaluated over their unbound variables.
      this.logDebug(context, `Push down filter across ${operation.input.length} union entries`);
      return [ true, factory.createUnion(operation.input
        .map(input => this.filterPushdown(expression, expressionVariables, input, factory, context)[1])) ];
    }
    if (isKnownOperation(operation, Algebra.Types.LEFT_JOIN)) {
      if (this.pushIntoLeftJoins) {
        const rightVariables = algebraUtils.inScopeVariables(operation.input[1]);
        if (!this.variablesIntersect(expressionVariables, rightVariables)) {
          // If filter *only* applies to left entry of optional, push it down into that.
          this.logDebug(context, `Push down filter into left join`);
          return [ true, factory.createLeftJoin(
            this.filterPushdown(expression, expressionVariables, operation.input[0], factory, context)[1],
            operation.input[1],
            operation.expression,
          ) ];
        }
      }

      // Don't push down in all other cases
      return [ false, factory.createFilter(operation, expression) ];
    }
    if (isKnownOperation(operation, Algebra.Types.PATTERN)) {
      if (this.pushEqualityIntoPatterns) {
        // Try to push simple FILTER(?s = <iri>) expressions into the pattern
        const pushableResult = this.getEqualityExpressionPushableIntoPattern(expression);
        if (pushableResult) {
          let isModified = false;
          const originalMetadata = operation.metadata;
          operation = mapTermsNested(operation, (value) => {
            if (value.equals(pushableResult.variable)) {
              isModified = true;
              return pushableResult.term;
            }
            return value;
          });
          operation.type = Algebra.Types.PATTERN;
          operation.metadata = originalMetadata;
          if (isModified) {
            this.logDebug(context, `Push down filter into pattern for ?${pushableResult.variable.value}`);
            return [ true, factory.createJoin([
              operation,
              factory.createValues(
                [ pushableResult.variable ],
                [{ [pushableResult.variable.value]: <RDF.NamedNode | RDF.Literal> pushableResult.term }],
              ),
            ]) ];
          }
        }
      }

      // Don't push down in all other cases
      return [ false, factory.createFilter(operation, expression) ];
    }
    if (isKnownOperation(operation, Algebra.Types.PATH)) {
      if (this.pushEqualityIntoPatterns) {
        // Try to push simple FILTER(?s = <iri>) expressions into the path
        const pushableResult = this.getEqualityExpressionPushableIntoPattern(expression);
        if (pushableResult &&
          (operation.subject.equals(pushableResult.variable) || operation.object.equals(pushableResult.variable))) {
          this.logDebug(context, `Push down filter into path for ?${pushableResult.variable.value}`);
          const path: Algebra.Path = {
            ...operation,
            subject: operation.subject.equals(pushableResult.variable) ? pushableResult.term : operation.subject,
            object: operation.object.equals(pushableResult.variable) ? pushableResult.term : operation.object,
          };
          return [ true, factory.createJoin([
            path,
            factory.createValues(
              [ pushableResult.variable ],
              [{ [pushableResult.variable.value]: <RDF.NamedNode | RDF.Literal> pushableResult.term }],
            ),
          ]) ];
        }
      }

      // Don't push down in all other cases
      return [ false, factory.createFilter(operation, expression) ];
    }

    // Operations that do not support pushing down
    // Left-join and minus might be possible to support in the future.
    return [ false, factory.createFilter(operation, expression) ];
  }

  /**
   * Check if the given expression is a simple equals operation with one variable and one non-literal
   * (or literal with canonical lexical form) term that can be pushed into a pattern.
   * @param expression The current expression.
   * @return The variable and term to fill into the pattern, or undefined.
   */
  public getEqualityExpressionPushableIntoPattern(
    expression: Algebra.Expression,
  ): { variable: RDF.Variable; term: RDF.Term } | undefined {
    if (isKnownSubType(expression, Algebra.ExpressionTypes.OPERATOR) && expression.operator === '=') {
      const arg0 = expression.args[0];
      const arg1 = expression.args[1];
      if (isKnownSubType(arg0, Algebra.ExpressionTypes.TERM) && arg0.term.termType !== 'Variable' &&
        (arg0.term.termType !== 'Literal' || this.isLiteralWithCanonicalLexicalForm(arg0.term)) &&
        isKnownSubType(arg1, Algebra.ExpressionTypes.TERM) &&
        arg1.term.termType === 'Variable') {
        return {
          variable: arg1.term,
          term: arg0.term,
        };
      }
      if (isKnownSubType(arg0, Algebra.ExpressionTypes.TERM) && arg0.term.termType === 'Variable' &&
        isKnownSubType(arg1, Algebra.ExpressionTypes.TERM) && arg1.term.termType !== 'Variable' &&
        (arg1.term.termType !== 'Literal' || this.isLiteralWithCanonicalLexicalForm(arg1.term))) {
        return {
          variable: arg0.term,
          term: arg1.term,
        };
      }
    }
  }

  /**
   * Check if the given term is a literal with datatype that where all values
   * can only have one possible lexical representation.
   * In other words, no variants of values exist that should be considered equal.
   * For example: "01"^xsd:number and "1"^xsd:number will return false.
   * @param term An RDF term.
   * @protected
   */
  protected isLiteralWithCanonicalLexicalForm(term: RDF.Literal): boolean {
    switch (term.datatype.value) {
      case 'http://www.w3.org/2001/XMLSchema#string':
      case 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString':
      case 'http://www.w3.org/2001/XMLSchema#normalizedString':
      case 'http://www.w3.org/2001/XMLSchema#anyURI':
      case 'http://www.w3.org/2001/XMLSchema#base64Binary':
      case 'http://www.w3.org/2001/XMLSchema#language':
      case 'http://www.w3.org/2001/XMLSchema#Name':
      case 'http://www.w3.org/2001/XMLSchema#NCName':
      case 'http://www.w3.org/2001/XMLSchema#NMTOKEN':
      case 'http://www.w3.org/2001/XMLSchema#token':
      case 'http://www.w3.org/2001/XMLSchema#hexBinary':
        return true;
    }
    return false;
  }

  /**
   * Check if there is an overlap between the two given lists of variables.
   * @param varsA A list of variables.
   * @param varsB A list of variables.
   */
  public variablesIntersect(varsA: RDF.Variable[], varsB: RDF.Variable[]): boolean {
    return varsA.some(varA => varsB.some(varB => varA.equals(varB)));
  }

  /**
   * Check if all variables from the first list are included in the second list.
   * The second list may contain other variables as well.
   * @param varsNeedles A list of variables to search for.
   * @param varsHaystack A list of variables to search in.
   */
  public variablesSubSetOf(varsNeedles: RDF.Variable[], varsHaystack: RDF.Variable[]): boolean {
    return varsNeedles.length <= varsHaystack.length &&
      varsNeedles.every(varA => varsHaystack.some(varB => varA.equals(varB)));
  }

  /**
   * Check if an expression is the boolean false.
   * @param expression An expression.
   */
  public isExpressionFalse(expression: Algebra.Expression): boolean {
    const casted = <Extract<Algebra.KnownExpression, { term?: unknown }>> expression;
    return (casted.term && casted.term.termType === 'Literal' &&
      casted.term.datatype.value === XSD_BOOLEAN && [ 'false', '0' ].includes(casted.term.value.trim()));
  }

  /**
   * Get all directly nested filter expressions.
   * As soon as a non-filter is found, it is returned as the input field.
   * @param op A filter expression.
   */
  public getNestedFilterExpressions(
    op: Algebra.Filter,
  ): { nestedExpressions: Algebra.Expression[]; input: Algebra.Operation } {
    if (isKnownOperation(op.input, Algebra.Types.FILTER)) {
      const childData = this.getNestedFilterExpressions(op.input);
      return { nestedExpressions: [ op.expression, ...childData.nestedExpressions ], input: childData.input };
    }
    return { nestedExpressions: [ op.expression ], input: op.input };
  }
}

export interface IActorOptimizeQueryOperationFilterPushdownArgs extends IActorOptimizeQueryOperationArgs {
  /**
   * If filters should be pushed down as deep as possible.
   * If false, filters will only be pushed down if the source(s) accept them,
   * or if the filter is very selective.
   * @range {boolean}
   * @default {false}
   */
  aggressivePushdown: boolean;
  /**
   * The maximum number of full iterations across the query can be done for attempting to push down filters.
   * @default {10}
   */
  maxIterations: number;
  /**
   * If conjunctive filters should be split into nested filters before applying filter pushdown.
   * This can enable pushing down deeper.
   * @range {boolean}
   * @default {true}
   */
  splitConjunctive: boolean;
  /**
   * If nested filters should be merged into conjunctive filters after applying filter pushdown.
   * @range {boolean}
   * @default {true}
   */
  mergeConjunctive: boolean;
  /**
   * If filters should be pushed into left-joins.
   * @range {boolean}
   * @default {true}
   */
  pushIntoLeftJoins: boolean;
  /**
   * If simple equality filters should be pushed into patterns and paths.
   * This only applies to equality filters with terms that are not literals that have no canonical lexical form.
   * @range {boolean}
   * @default {true}
   */
  pushEqualityIntoPatterns: boolean;
}
