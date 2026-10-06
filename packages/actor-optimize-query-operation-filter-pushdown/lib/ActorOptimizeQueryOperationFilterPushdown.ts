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
  getExpressionVariables,
  getOperationSource,
  variablesIntersect,
  variablesSubsetOf,
} from '@comunica/utils-query-operation';
import type * as RDF from '@rdfjs/types';
import { mapTermsNested } from 'rdf-terms';

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
    if (this.getVariableTermEquality(expression)) {
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

    const pushdownTarget = this.getPushdownTarget(operation, expressionVariables);
    if (pushdownTarget) {
      const [ isInputModified, input ] = this
        .filterPushdown(expression, expressionVariables, pushdownTarget.input, factory, context);
      // Moving a filter below another filter is no improvement by itself, and would make both swap indefinitely.
      if (isKnownOperation(operation, Algebra.Types.FILTER)) {
        return [ isInputModified, pushdownTarget.replaceInput(input) ];
      }
      this.logDebug(context, `Push down filter into ${operation.type}`);
      return [ true, pushdownTarget.replaceInput(input) ];
    }

    // Don't push down into an entry that must be bound by its parent join, such as a SERVICE clause with a variable
    // target. Wrapping such an entry in a filter would leave no join actor able to bind it.
    if ((isKnownOperation(operation, Algebra.Types.JOIN) || isKnownOperation(operation, Algebra.Types.UNION)) &&
      operation.input.some(input => ActorOptimizeQueryOperationFilterPushdown.hasVariableServiceTarget(input))) {
      return [ false, factory.createFilter(operation, expression) ];
    }
    if (isKnownOperation(operation, Algebra.Types.JOIN)) {
      return this.filterPushdownIntoJoin(expression, expressionVariables, operation, factory, context);
    }
    if (isKnownOperation(operation, Algebra.Types.UNION)) {
      // Filters apply to each solution separately, so they can be applied to each union entry separately.
      this.logDebug(context, `Push down filter into ${operation.input.length} union entries`);
      return [ true, factory.createUnion(operation.input
        .map(input => this.filterPushdown(expression, expressionVariables, input, factory, context)[1])) ];
    }
    if (this.pushEqualityIntoPatterns &&
      (isKnownOperation(operation, Algebra.Types.PATTERN) || isKnownOperation(operation, Algebra.Types.PATH))) {
      return this.filterPushdownIntoPatternOrPath(expression, operation, factory, context);
    }

    return [ false, factory.createFilter(operation, expression) ];
  }

  /**
   * Determine the input of the given operation into which a filter over that operation can be moved,
   * without changing the solutions of that filter.
   * @param operation The operation the filter applies to.
   * @param expressionVariables The variables inside the filter expression.
   * @return The input to push into and a function that replaces it within the operation, or undefined if none exists.
   */
  public getPushdownTarget(
    operation: Algebra.Operation,
    expressionVariables: RDF.Variable[],
  ): IFilterPushdownTarget | undefined {
    const getSingleInputTarget = (single: Algebra.Single): IFilterPushdownTarget => ({
      input: single.input,
      replaceInput: input => ({ ...single, input }),
    });
    const getLeftInputTarget = (double: Algebra.Double): IFilterPushdownTarget => ({
      input: double.input[0],
      replaceInput: input => ({ ...double, input: [ input, double.input[1] ]}),
    });

    // Filtering commutes with these operations, as they do not modify the bindings of solutions
    if (isKnownOperation(operation, Algebra.Types.FILTER) ||
      isKnownOperation(operation, Algebra.Types.DISTINCT) ||
      isKnownOperation(operation, Algebra.Types.REDUCED) ||
      isKnownOperation(operation, Algebra.Types.ORDER_BY)) {
      return getSingleInputTarget(operation);
    }
    // Variables that are not projected are unbound above the projection, but may be bound within it
    if (isKnownOperation(operation, Algebra.Types.PROJECT) &&
      variablesSubsetOf(expressionVariables, operation.variables)) {
      return getSingleInputTarget(operation);
    }
    if (isKnownOperation(operation, Algebra.Types.EXTEND) &&
      !variablesIntersect([ operation.variable ], expressionVariables)) {
      return getSingleInputTarget(operation);
    }
    // Filtering on grouped variables removes entire groups, unless implicit grouping produces a group for no solutions
    if (isKnownOperation(operation, Algebra.Types.GROUP) && operation.variables.length > 0 &&
      variablesSubsetOf(expressionVariables, operation.variables)) {
      return getSingleInputTarget(operation);
    }
    if (isKnownOperation(operation, Algebra.Types.LEFT_JOIN) && this.pushIntoLeftJoins &&
      !variablesIntersect(expressionVariables, algebraUtils.inScopeVariables(operation.input[1]))) {
      return getLeftInputTarget(operation);
    }
    // Minus only removes left solutions, without changing their bindings
    if (isKnownOperation(operation, Algebra.Types.MINUS)) {
      return getLeftInputTarget(operation);
    }
  }

  /**
   * Push down the given expression into the entries of the given join that bind all of its variables.
   * If no such entry exists, the filter is applied to the join of all entries that bind some of its variables.
   * @param expression An expression to push down.
   * @param expressionVariables The variables inside the given expression.
   * @param join The join to push down into.
   * @param factory An algebra factory.
   * @param context The action context.
   * @return A tuple indicating if the operation was modified and the modified operation.
   */
  public filterPushdownIntoJoin(
    expression: Algebra.Expression,
    expressionVariables: RDF.Variable[],
    join: Algebra.Join,
    factory: AlgebraFactory,
    context: IActionContext,
  ): [ boolean, Algebra.Operation ] {
    const fullyOverlapping: Algebra.Operation[] = [];
    const partiallyOverlapping: Algebra.Operation[] = [];
    const notOverlapping: Algebra.Operation[] = [];
    for (const input of join.input) {
      const inputVariables = algebraUtils.inScopeVariables(input);
      if (variablesSubsetOf(expressionVariables, inputVariables)) {
        fullyOverlapping.push(input);
      } else if (variablesIntersect(expressionVariables, inputVariables)) {
        partiallyOverlapping.push(input);
      } else {
        notOverlapping.push(input);
      }
    }

    if (fullyOverlapping.length > 0) {
      this.logDebug(context, `Push down filter into ${fullyOverlapping.length} of ${join.input.length} join entries`);
      return [ true, factory.createJoin(join.input.map(input => fullyOverlapping.includes(input) ?
        this.filterPushdown(expression, expressionVariables, input, factory, context)[1] :
        input)) ];
    }
    if (partiallyOverlapping.length > 0 && notOverlapping.length > 0) {
      this.logDebug(context, `Push down filter into the join of ${partiallyOverlapping.length} of ${join.input.length} join entries`);
      return [ true, factory.createJoin([
        factory.createFilter(factory.createJoin(partiallyOverlapping, false), expression),
        ...notOverlapping,
      ]) ];
    }
    return [ false, factory.createFilter(join, expression) ];
  }

  /**
   * Push down an equality expression such as FILTER(?s = <iri>) into the given pattern or path,
   * by replacing the variable with the term, and joining with a VALUES clause that binds the variable.
   * @param expression An expression to push down.
   * @param operation The pattern or path to push down into.
   * @param factory An algebra factory.
   * @param context The action context.
   * @return A tuple indicating if the operation was modified and the modified operation.
   */
  public filterPushdownIntoPatternOrPath(
    expression: Algebra.Expression,
    operation: Algebra.Pattern | Algebra.Path,
    factory: AlgebraFactory,
    context: IActionContext,
  ): [ boolean, Algebra.Operation ] {
    const equality = this.getEqualityExpressionPushableIntoPattern(expression);
    const substituted = equality && this.substituteVariable(operation, equality.variable, equality.term, factory);
    if (!substituted) {
      return [ false, factory.createFilter(operation, expression) ];
    }
    this.logDebug(context, `Push down filter into ${operation.type} for ?${equality.variable.value}`);
    return [ true, factory.createJoin([
      substituted,
      factory.createValues(
        [ equality.variable ],
        [{ [equality.variable.value]: <RDF.NamedNode | RDF.Literal> equality.term }],
      ),
    ]) ];
  }

  /**
   * Replace all occurrences of a variable in the terms of a pattern or path, including within quoted triples.
   * @param operation A pattern or path.
   * @param variable The variable to replace.
   * @param term The term to replace the variable with.
   * @param factory An algebra factory.
   * @return The operation with the variable replaced, or undefined if the variable does not occur.
   */
  public substituteVariable(
    operation: Algebra.Pattern | Algebra.Path,
    variable: RDF.Variable,
    term: RDF.Term,
    factory: AlgebraFactory,
  ): Algebra.Pattern | Algebra.Path | undefined {
    let isSubstituted = false;
    const substituteFlat = (value: RDF.Term): RDF.Term => {
      if (value.equals(variable)) {
        isSubstituted = true;
        return term;
      }
      return value;
    };
    const substitute = (value: RDF.Term): RDF.Term =>
      value.termType === 'Quad' ? mapTermsNested(value, substituteFlat) : substituteFlat(value);

    const substituted: Algebra.Pattern | Algebra.Path = isKnownOperation(operation, Algebra.Types.PATTERN) ?
      factory.createPattern(
        substitute(operation.subject),
        substitute(operation.predicate),
        substitute(operation.object),
        substitute(operation.graph),
      ) :
      factory.createPath(
        substitute(operation.subject),
        operation.predicate,
        substitute(operation.object),
        substitute(operation.graph),
      );
    // Keep metadata such as source annotations
    substituted.metadata = operation.metadata;
    return isSubstituted ? substituted : undefined;
  }

  /**
   * Get the variable and term of an equality expression between a variable and a non-variable term,
   * such as FILTER(?s = <iri>) or FILTER(<iri> = ?s).
   * @param expression An expression.
   * @return The variable and term, or undefined if the expression is no such equality.
   */
  public getVariableTermEquality(
    expression: Algebra.Expression,
  ): { variable: RDF.Variable; term: RDF.Term } | undefined {
    if (isKnownSubType(expression, Algebra.ExpressionTypes.OPERATOR) && expression.operator === '=') {
      const [ left, right ] = expression.args;
      if (isKnownSubType(left, Algebra.ExpressionTypes.TERM) && isKnownSubType(right, Algebra.ExpressionTypes.TERM)) {
        if (left.term.termType === 'Variable' && right.term.termType !== 'Variable') {
          return { variable: left.term, term: right.term };
        }
        if (right.term.termType === 'Variable' && left.term.termType !== 'Variable') {
          return { variable: right.term, term: left.term };
        }
      }
    }
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
    const equality = this.getVariableTermEquality(expression);
    if (equality && (equality.term.termType !== 'Literal' || this.isLiteralWithCanonicalLexicalForm(equality.term))) {
      return equality;
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
   * Check if an expression is simply 'false'.
   * @param expression An expression.
   */
  public isExpressionFalse(expression: Algebra.Expression): boolean {
    const casted = <Extract<Algebra.KnownExpression, { term?: unknown }>> expression;
    return (casted.term && casted.term.termType === 'Literal' && casted.term.value === 'false');
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

/**
 * An input of an operation into which a filter over that operation can be pushed down.
 */
export interface IFilterPushdownTarget {
  /**
   * The input to push the filter into.
   */
  input: Algebra.Operation;
  /**
   * Create a copy of the operation in which the input is replaced.
   * @param input The new input.
   * @return The operation with the replaced input.
   */
  replaceInput: (input: Algebra.Operation) => Algebra.Operation;
}
