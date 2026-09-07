import type * as RDF from '@rdfjs/types';
import type { Algebra as TraqulaAlgebra } from '@traqula/algebra-transformations-1-2';
import { algebraUtils, Types } from '@traqula/algebra-transformations-1-2';

// eslint-disable-next-line unused-imports/no-unused-imports,unused-imports/no-unused-imports-ts
import type { PreOrderMappingReturn, TransformContext, VisitContext } from '@traqula/core';
import { TransformerSubTyped } from '@traqula/core';
import type { KnownOperation, Operation } from './Algebra';
import { TypesComunica } from './TypesComunica';

export const resolveIRI = algebraUtils.resolveIRI;
export const objectify = algebraUtils.objectify;

/**
 * Type guard that checks if an operation is of a certain type and subType known by Comunica.
 * In case the type and subtype matches one known by Comunica,
 * the type guard will conclude the operation contains all member Comunica expects from this operation-type and subtype.
 * @param val the operation that should be type checked
 * @param type the type we want to test against
 * @param subType the potential subtype we want to test against
 *     - when provided and not matching, we do not fall back to just checking the type.
 * @return a boolean indicating whether the type and subtype are equal to the expected type and subtype.
 * Only checking the subtype when a string is provided.
 */
export function isKnownOperation<
  Type extends KnownOperation['type'],
  SubType extends Extract<KnownOperation, { type: Type }>['subType'] | undefined = undefined,
>(val: Operation, type: Type, subType?: SubType): val is
  SubType extends undefined ? (
    Extract<KnownOperation, { type: Type }> extends object ?
      Extract<KnownOperation, { type: Type }> : { type: Type }
  ) : Extract<KnownOperation, { type: Type; subType: SubType }> extends object ?
    Extract<KnownOperation, { type: Type; subType: SubType }> : { type: Type; subType: SubType } {
  return val.type === type && (subType === undefined || val.subType === subType);
}

/**
 * Type guard that checks if an operation is of a certain subType known by Comunica.
 * In case the subtype matches one known by Comunica,
 * the type guard will conclude the operation contains all member Comunica expects from this operation-subtype
 * @param val the operation that should be type checked
 * @param subType the subType we want to test against
 * @return a boolean indicating whether the subType equals the expected subType
 */
export function isKnownSubType<
  SubType extends KnownOperation['subType'],
  Obj extends Operation,
>(val: Obj, subType: SubType):
  val is Extract<KnownOperation, { type: Obj['type']; subType: SubType }> extends object ?
    Obj & Extract<KnownOperation, { type: Obj['type']; subType: SubType }> : Obj & { subType: SubType } {
  return val.subType === subType;
}

// ----------------------- manipulators --------------------

type _NeedRefForReusabilityWithoutExplicitTypeDefinition = TraqulaAlgebra.Operation;
export const transformer = new TransformerSubTyped<KnownOperation>({
  /**
   * Metadata often contains references to actors,
   * the transformer should not copy these actors, nor should it traverse the actors when visitingOperations.
   * (since there can be cycles involved).
   * It should however still make a shallowCopy from the metadata object, but not map over it.
   */
  shallowKeys: new Set([ 'metadata' ]),
  ignoreKeys: new Set([ 'metadata' ]),
}, {
  // Optimization that causes search tree pruning
  [Types.PATTERN]: { ignoreKeys: new Set([ 'subject', 'predicate', 'object', 'graph', 'metadata' ]) },
  [Types.EXPRESSION]: { ignoreKeys: new Set([ 'name', 'term', 'wildcard', 'variable', 'metadata' ]) },
  [Types.DESCRIBE]: { ignoreKeys: new Set([ 'terms', 'metadata' ]) },
  [Types.EXTEND]: { ignoreKeys: new Set([ 'variable', 'metadata' ]) },
  [Types.FROM]: { ignoreKeys: new Set([ 'default', 'named', 'metadata' ]) },
  [Types.GRAPH]: { ignoreKeys: new Set([ 'name', 'metadata' ]) },
  [Types.GROUP]: { ignoreKeys: new Set([ 'variables', 'metadata' ]) },
  [Types.LINK]: { ignoreKeys: new Set([ 'iri', 'metadata' ]) },
  [Types.NPS]: { ignoreKeys: new Set([ 'iris', 'metadata' ]) },
  [Types.PATH]: { ignoreKeys: new Set([ 'subject', 'object', 'graph', 'metadata' ]) },
  [Types.PROJECT]: { ignoreKeys: new Set([ 'variables', 'metadata' ]) },
  [Types.SERVICE]: { ignoreKeys: new Set([ 'name', 'metadata' ]) },
  [Types.VALUES]: { ignoreKeys: new Set([ 'variables', 'bindings', 'metadata' ]) },
  [Types.LOAD]: { ignoreKeys: new Set([ 'source', 'destination', 'metadata' ]) },
  [Types.CLEAR]: { ignoreKeys: new Set([ 'source', 'metadata' ]) },
  [Types.CREATE]: { ignoreKeys: new Set([ 'source', 'metadata' ]) },
  [Types.DROP]: { ignoreKeys: new Set([ 'source', 'metadata' ]) },
  [Types.ADD]: { ignoreKeys: new Set([ 'source', 'destination', 'metadata' ]) },
  [Types.MOVE]: { ignoreKeys: new Set([ 'source', 'destination', 'metadata' ]) },
  [Types.COPY]: { ignoreKeys: new Set([ 'source', 'destination', 'metadata' ]) },
  [TypesComunica.NODES]: { ignoreKeys: new Set([ 'variable', 'metadata' ]) },
});

/**
 * Transform a single operation, similar to {@link mapOperation}, but using stricter typings.
 * e.g. wrapping a distinct around the outermost project:
 * ```ts
 * mapOperationStrict<'unsafe', Operation>({
 *   type: Algebra.Types.SLICE,
 *   input: {
 *     type: Algebra.Types.PROJECT,
 *     input: {
 *       type: Algebra.Types.JOIN,
 *       input: [{ type: Algebra.Types.PROJECT }, { type: Algebra.Types.BGP }],
 *     },
 *   },
 * }, {
 *   [Algebra.Types.PROJECT]: {
 *     preVisitor: () => ({ continue: false }),
 *     transform: projection => algebraFactory.createDistinct(projection),
 *   },
 * });
 * const returns = {
 *   type: Algebra.Types.SLICE,
 *   input: {
 *     type: Algebra.Types.DISTINCT,
 *     input: {
 *       type: Algebra.Types.PROJECT,
 *       input: {
 *         type: Algebra.Types.JOIN,
 *         input: [{ type: Algebra.Types.PROJECT }, { type: Algebra.Types.BGP }],
 *       },
 *     },
 *   },
 * };
 * ```
 * @param startObject the object from which we will start the transformation,
 *   potentially visiting and transforming its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to objects optionally
 *    containing preVisitor and transformer.
 *    The preVisitor allows you to provide {@link TransformContext} for the current object,
 *    altering how it will be transformed.
 *    The transformer allows you to manipulate the copy of the current object,
 *    and expects you to return the value that should take the current objects place.
 * @return the result of transforming the requested descendant operations (based on the preVisitor)
 * using a transformer that works its way back up from the descendant to the startObject.
 */
export const mapOperationStrict = transformer.transformNode.bind(transformer);

/**
 * Transform a single operation.
 * e.g. wrapping a distinct around the outermost project:
 * ```ts
 * mapOperation({
 *   type: Algebra.Types.SLICE,
 *   input: {
 *     type: Algebra.Types.PROJECT,
 *     input: {
 *       type: Algebra.Types.JOIN,
 *       input: [{ type: Algebra.Types.PROJECT }, { type: Algebra.Types.BGP }],
 *     },
 *   },
 * }, {
 *   [Algebra.Types.PROJECT]: {
 *     preVisitor: () => ({ continue: false }),
 *     transform: projection => algebraFactory.createDistinct(projection),
 *   },
 * });
 * const returns = {
 *   type: Algebra.Types.SLICE,
 *   input: {
 *     type: Algebra.Types.DISTINCT,
 *     input: {
 *       type: Algebra.Types.PROJECT,
 *       input: {
 *         type: Algebra.Types.JOIN,
 *         input: [{ type: Algebra.Types.PROJECT }, { type: Algebra.Types.BGP }],
 *       },
 *     },
 *   },
 * };
 * ```
 * @param startObject the object from which we will start the transformation,
 *   potentially visiting and transforming its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to objects optionally
 *    containing preVisitor and transformer.
 *    The preVisitor allows you to provide {@link TransformContext} for the current object,
 *    altering how it will be transformed.
 *    The transformer allows you to manipulate the copy of the current object,
 *    and expects you to return the value that should take the current objects place.
 * @return the result of transforming the requested descendant operations (based on the preVisitor)
 * using a transformer that works its way back up from the descendant to the startObject.
 */
export const mapOperation: (typeof mapOperationStrict<'unsafe', Operation>) = <any> mapOperationStrict;

/**
 * Transform a single operation, similar to {@link mapOperationAsync}, but using stricter typings.
 */
export const mapOperationAsyncStrict = transformer.transformNodeAsync.bind(transformer);

/**
 * Async variant of {@link mapOperation}, accepting promise-returning callbacks and returning a Promise.
 * Both the preVisitor and the transform of every callback may return a promise, which is awaited before the
 * traversal continues. The traversal stays strictly sequential (depth-first): siblings are not visited
 * concurrently, so the callbacks observe the exact same order as the synchronous {@link mapOperation}.
 * @param startObject the object from which we will start the transformation,
 *   potentially visiting and transforming its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to objects optionally
 *    containing preVisitor and transformer, each of which may be asynchronous.
 * @return a promise for the result of transforming the requested descendant operations.
 */
export const mapOperationAsync: (typeof mapOperationAsyncStrict<'unsafe', Operation>) =
  <any> mapOperationAsyncStrict;

/**
 * Transform a single operation pre-order, similar to {@link mapOperationPreOrder}, but using stricter typings.
 */
export const mapOperationPreOrderStrict = transformer.transformNodePreOrder.bind(transformer);

/**
 * Transform a single operation pre-order, the dual of {@link mapOperation}: an operation is mapped
 * _before_ its descendants, and we iterate into the result of that mapping.
 * This is what you want for an operation that has to travel deeper into the tree,
 * like a filter pushdown: the callback only describes how the filter swaps places with the operation right
 * below it, and the filters it sank into are mapped in turn.
 * e.g. sinking a filter into every branch of the unions below it:
 * ```ts
 * mapOperationPreOrder({
 *   type: Algebra.Types.FILTER,
 *   expression,
 *   input: {
 *     type: Algebra.Types.UNION,
 *     input: [{ type: Algebra.Types.BGP }, { type: Algebra.Types.BGP }],
 *   },
 * }, {
 *   [Algebra.Types.FILTER]: (filter) => {
 *     if (filter.input.type === Algebra.Types.UNION) {
 *       return { newValue: algebraFactory.createUnion(
 *         filter.input.input.map(branch => algebraFactory.createFilter(branch, filter.expression)),
 *         false,
 *       ) };
 *     }
 *     // Any other operation is a barrier for this filter
 *     return { newValue: filter };
 *   },
 * });
 * const returns = {
 *   type: Algebra.Types.UNION,
 *   input: [
 *     { type: Algebra.Types.FILTER, expression, input: { type: Algebra.Types.BGP }},
 *     { type: Algebra.Types.FILTER, expression, input: { type: Algebra.Types.BGP }},
 *   ],
 * };
 * ```
 * Contrary to {@link mapOperation}, a callback does not just return the value taking the place of the
 * operation, it returns a {@link PreOrderMappingReturn}: that value, plus the {@link TransformContext} of
 * that value. Since the callback decides what we iterate into, it is also the one telling us how to iterate
 * into it, so there is no separate preVisitor.
 * Also contrary to {@link mapOperation}, the descendants of the operation given to the callback are not
 * mapped yet: they are the operations of the input tree itself, so changing the properties _of a descendant_
 * writes straight into that tree.
 * @param startObject the object from which we will start the transformation,
 *   potentially visiting and transforming its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to a mapper.
 *    The mapper allows you to manipulate the copy of the current operation, and expects you to return the
 *    value that should take the current operations place, together with the context of that value.
 *    That context steers how we iterate into the returned value.
 * @return the result of transforming the startObject and the descendants of its rewrites.
 */
export const mapOperationPreOrder: (typeof mapOperationPreOrderStrict<'unsafe', Operation>) =
  <any> mapOperationPreOrderStrict;

/**
 * Transform a single operation pre-order, similar to {@link mapOperationPreOrderAsync},
 * but using stricter typings.
 */
export const mapOperationPreOrderAsyncStrict = transformer.transformNodePreOrderAsync.bind(transformer);

/**
 * Async variant of {@link mapOperationPreOrder}, accepting promise-returning mappers and returning a Promise.
 * A mapper may return a promise for its {@link PreOrderMappingReturn}, which is awaited before we iterate
 * into the value it carries. The traversal stays strictly sequential (depth-first): siblings are not visited
 * concurrently, so the mappers observe the exact same order as the synchronous {@link mapOperationPreOrder}.
 * @param startObject the object from which we will start the transformation,
 *   potentially visiting and transforming its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to a possibly asynchronous mapper.
 * @return a promise for the result of transforming the startObject and the descendants of its rewrites.
 */
export const mapOperationPreOrderAsync: (typeof mapOperationPreOrderAsyncStrict<'unsafe', Operation>) =
  <any> mapOperationPreOrderAsyncStrict;

/**
 * Transform a single operation, similar to {@link mapOperationSub}, but using stricter typings.
 * e.g. wrapping a distinct around the all project operations not contained in an aggregate expression
 * (invalid algebra anyway):
 * ```ts
 * mapOperationSubStrict<'unsafe', Operation>({
 *   type: Algebra.Types.SLICE,
 *   input: {
 *     type: Algebra.Types.PROJECT,
 *     input: {
 *       type: Algebra.Types.JOIN,
 *       input: [{
 *         type: Algebra.Types.EXPRESSION,
 *         subType: Algebra.ExpressionTypes.AGGREGATE,
 *         input: { type: Algebra.Types.PROJECT },
 *       }, { type: Algebra.Types.BGP }],
 *     },
 *   },
 * }, { [Algebra.Types.PROJECT]: {
 *   transform: projection => algebraFactory.createDistinct(projection),
 * }}, { [Algebra.Types.EXPRESSION]: { [Algebra.ExpressionTypes.AGGREGATE]: {
 *   preVisitor: () => ({ continue: false }),
 * }}});
 * const returns = {
 *   type: Algebra.Types.SLICE,
 *   input: {
 *     type: Algebra.Types.DISTINCT,
 *     input: {
 *       type: Algebra.Types.PROJECT,
 *       input: {
 *         type: Algebra.Types.JOIN,
 *         input: [{
 *           type: Algebra.Types.EXPRESSION,
 *           subType: Algebra.ExpressionTypes.AGGREGATE,
 *           input: { type: Algebra.Types.PROJECT },
 *         }, { type: Algebra.Types.BGP }],
 *       },
 *     },
 *   },
 * };
 * ```
 * @param startObject the object from which we will start the transformation,
 *   potentially visiting and transforming its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to objects optionally
 *    containing preVisitor and transformer.
 *    The preVisitor allows you to provide {@link TransformContext} for the current object,
 *    altering how it will be transformed.
 *    The transformer allows you to manipulate the copy of the current object,
 *    and expects you to return the value that should take the current objects place.
 * @param nodeSpecificCallBacks Same as nodeCallBacks but using an additional level of indirection to
 *     indicate the subType.
 * @return the result of transforming the requested descendant operations (based on the preVisitor)
 * using a transformer that works its way back up from the descendant to the startObject.
 */
export const mapOperationSubStrict = transformer.transformNodeSpecific.bind(transformer);

/**
 * Transform a single operation, similar to {@link mapOperation}, but also allowing you to target subTypes.
 * e.g. wrapping a distinct around the all project operations not contained in an aggregate expression
 * (invalid algebra anyway):
 * ```ts
 * mapOperationSub({
 *   type: Algebra.Types.SLICE,
 *   input: {
 *     type: Algebra.Types.PROJECT,
 *     input: {
 *       type: Algebra.Types.JOIN,
 *       input: [{
 *         type: Algebra.Types.EXPRESSION,
 *         subType: Algebra.ExpressionTypes.AGGREGATE,
 *         input: { type: Algebra.Types.PROJECT },
 *       }, { type: Algebra.Types.BGP }],
 *     },
 *   },
 * }, { [Algebra.Types.PROJECT]: {
 *   transform: projection => algebraFactory.createDistinct(projection),
 * }}, { [Algebra.Types.EXPRESSION]: { [Algebra.ExpressionTypes.AGGREGATE]: {
 *   preVisitor: () => ({ continue: false }),
 * }}});
 * const returns = {
 *   type: Algebra.Types.SLICE,
 *   input: {
 *     type: Algebra.Types.DISTINCT,
 *     input: {
 *       type: Algebra.Types.PROJECT,
 *       input: {
 *         type: Algebra.Types.JOIN,
 *         input: [{
 *           type: Algebra.Types.EXPRESSION,
 *           subType: Algebra.ExpressionTypes.AGGREGATE,
 *           input: { type: Algebra.Types.PROJECT },
 *         }, { type: Algebra.Types.BGP }],
 *       },
 *     },
 *   },
 * };
 * ```
 * @param startObject the object from which we will start the transformation,
 *   potentially visiting and transforming its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to objects optionally
 *    containing preVisitor and transformer.
 *    The preVisitor allows you to provide {@link TransformContext} for the current object,
 *    altering how it will be transformed.
 *    The transformer allows you to manipulate the copy of the current object,
 *    and expects you to return the value that should take the current objects place.
 * @param nodeSpecificCallBacks Same as nodeCallBacks but using an additional level of indirection to
 *     indicate the subType.
 * @return the result of transforming the requested descendant operations (based on the preVisitor)
 * using a transformer that works its way back up from the descendant to the startObject.
 *
 * NOTE: the `Sub` variants only dispatch on nodes that actually carry a `subType`, for the type-level
 * `nodeCallBacks` just as much as for `nodeSpecificCallBacks`. In this algebra only EXPRESSION nodes have a
 * subType, so a type-level callback registered here for any other type - PROJECT in the example above
 * included - silently never fires. Use {@link mapOperation} whenever you dispatch on the type alone, and
 * reach for a `Sub` variant only to reach a subType.
 */
export const mapOperationSub: (typeof mapOperationSubStrict<'unsafe', Operation>) = <any> mapOperationSubStrict;

/**
 * Transform a single operation, similar to {@link mapOperationSubAsync}, but using stricter typings.
 */
export const mapOperationSubAsyncStrict = transformer.transformNodeSpecificAsync.bind(transformer);

/**
 * Async variant of {@link mapOperationSub}, accepting promise-returning callbacks and returning a Promise.
 * Both the preVisitor and the transform of every callback may return a promise, which is awaited before the
 * traversal continues. The traversal stays strictly sequential (depth-first): siblings are not visited
 * concurrently, so the callbacks observe the exact same order as the synchronous {@link mapOperationSub}.
 * The subType dispatch caveat on {@link mapOperationSub} applies here too.
 * @param startObject the object from which we will start the transformation,
 *   potentially visiting and transforming its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to objects optionally
 *    containing preVisitor and transformer, each of which may be asynchronous.
 * @param nodeSpecificCallBacks Same as nodeCallBacks but using an additional level of indirection to
 *     indicate the subType.
 * @return a promise for the result of transforming the requested descendant operations.
 */
export const mapOperationSubAsync: (typeof mapOperationSubAsyncStrict<'unsafe', Operation>) =
  <any> mapOperationSubAsyncStrict;

/**
 * Transform a single operation pre-order, similar to {@link mapOperationSubPreOrder},
 * but using stricter typings.
 */
export const mapOperationSubPreOrderStrict = transformer.transformNodeSpecificPreOrder.bind(transformer);

/**
 * Transform a single operation pre-order, similar to {@link mapOperationPreOrder},
 * but also allowing you to target subTypes - it is to {@link mapOperationSub} what
 * {@link mapOperationPreOrder} is to {@link mapOperation}.
 * e.g. replacing every aggregate expression, and iterating into the operator expression it becomes:
 * ```ts
 * mapOperationSubPreOrder(
 *   algebraFactory.createAggregateExpression('count', inner, false),
 *   {},
 *   { [Algebra.Types.EXPRESSION]: { [Algebra.ExpressionTypes.AGGREGATE]: copy =>
 *     ({ newValue: algebraFactory.createOperatorExpression('!', [ copy.expression ]) }),
 *   }},
 * );
 * ```
 * Just like {@link mapOperationSub}, a callback registered for the subType of an operation takes
 * precedence over the one registered for its type.
 * The same caveats as on {@link mapOperationPreOrder} apply: the callback returns the value taking the
 * place of the operation together with the {@link TransformContext} of that value, and the descendants
 * it is handed are those of the input tree.
 * The subType dispatch caveat on {@link mapOperationSub} applies here too.
 * @param startObject the object from which we will start the transformation,
 *   potentially visiting and transforming its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to a mapper.
 *    The mapper allows you to manipulate the copy of the current operation, and expects you to return the
 *    value that should take the current operations place, together with the context of that value.
 *    That context steers how we iterate into the returned value.
 * @param nodeSpecificCallBacks Same as nodeCallBacks but using an additional level of indirection to
 *     indicate the subType.
 * @return the result of transforming the startObject and the descendants of its rewrites.
 */
export const mapOperationSubPreOrder: (typeof mapOperationSubPreOrderStrict<'unsafe', Operation>) =
  <any> mapOperationSubPreOrderStrict;

/**
 * Transform a single operation pre-order, similar to {@link mapOperationSubPreOrderAsync},
 * but using stricter typings.
 */
export const mapOperationSubPreOrderAsyncStrict =
  transformer.transformNodeSpecificPreOrderAsync.bind(transformer);

/**
 * Async variant of {@link mapOperationSubPreOrder}, accepting promise-returning mappers and returning a
 * Promise. A mapper may return a promise for its {@link PreOrderMappingReturn}, which is awaited before we
 * iterate into the value it carries. The traversal stays strictly sequential (depth-first): siblings are not
 * visited concurrently, so the mappers observe the exact same order as the synchronous
 * {@link mapOperationSubPreOrder}.
 * The subType dispatch caveat on {@link mapOperationSub} applies here too.
 * @param startObject the object from which we will start the transformation,
 *   potentially visiting and transforming its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to a possibly asynchronous mapper.
 * @param nodeSpecificCallBacks Same as nodeCallBacks but using an additional level of indirection to
 *     indicate the subType.
 * @return a promise for the result of transforming the startObject and the descendants of its rewrites.
 */
export const mapOperationSubPreOrderAsync: (typeof mapOperationSubPreOrderAsyncStrict<'unsafe', Operation>) =
  <any> mapOperationSubPreOrderAsyncStrict;

/**
 * Similar to {@link mapOperation}, but only visiting instead of copying and transforming explicitly.
 * e.g.:
 * ```ts
 * visitOperation({
 *   type: Algebra.Types.DISTINCT,
 *   input: {
 *     type: Algebra.Types.PROJECT,
 *     input: { type: Algebra.Types.DISTINCT },
 *   },
 * }, {
 *   [Algebra.Types.DISTINCT]: { visitor: () => console.log('1') },
 *   [Algebra.Types.PROJECT]: {
 *     preVisitor: () => ({ continue: false }),
 *     visitor: () => console.log('2'),
 *   },
 * });
 * ```
 * Will first call the preVisitor on the project and notice it should not iterate on its descendants.
 * It then visits the project, and the outermost distinct, printing '21'.
 * The pre-visitor visits starting from the root, going deeper, while the actual visitor goes in reverse.
 * @param startObject the object from which we will start visiting,
 *   potentially visiting its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to objects optionally
 *    containing preVisitor and visitor.
 *    The preVisitor allows you to provide {@link VisitContext} for the current object,
 *    altering how it will be visited.
 *    The visitor allows you to visit the object from deepest to the outermost object.
 *    This is useful if you for example want to manipulate the objects you visit during your visits,
 *    similar to {@link mapOperation}.
 */
export const visitOperation = transformer.visitNode.bind(transformer);

/**
 * Async variant of {@link visitOperation}, accepting promise-returning callbacks and returning a Promise.
 * Both the preVisitor and the visitor of every callback may return a promise, which is awaited before the
 * traversal continues. The traversal stays strictly sequential (depth-first): siblings are not visited
 * concurrently, so the callbacks observe the exact same order as the synchronous {@link visitOperation}.
 */
export const visitOperationAsync = transformer.visitNodeAsync.bind(transformer);

/**
 * Visits an object and it's descendants, similar to {@link visitOperation},
 * but also allowing you to target subTypes. e.g.:
 * e.g.:
 * ```ts
 * visitOperationSub({
 *   type: Algebra.Types.DISTINCT,
 *   input: {
 *     type: Algebra.Types.DISTINCT,
 *     subType: 'special',
 *   },
 * }, {
 *   [Algebra.Types.DISTINCT]: {
 *     visitor: () => console.log('1'),
 *     preVisitor: () => {
 *       console.log('2');
 *       return {};
 *     },
 *   },
 * }, {
 *   [Algebra.Types.DISTINCT]: { special: {
 *     visitor: () => console.log('3'),
 *   }},
 * });
 * ```
 * Will call the preVisitor on the outer distinct, then the visitor of the special distinct,
 * followed by the visiting the outer distinct, printing '231'.
 * The pre-visitor visits starting from the root, going deeper, while the actual visitor goes in reverse.
 * The subType dispatch caveat on {@link mapOperationSub} applies here too.
 * @param startObject the object from which we will start visiting,
 *   potentially visiting its descendants along the way.
 * @param nodeCallBacks a dictionary mapping the various operation types to objects optionally
 *    containing preVisitor and visitor.
 *    The preVisitor allows you to provide {@link VisitContext} for the current object,
 *    altering how it will be visited.
 *    The visitor allows you to visit the object from deepest to the outermost object.
 *    This is useful if you for example want to manipulate the objects you visit during your visits,
 *    similar to {@link mapOperation}.
 * @param nodeSpecificCallBacks Same as nodeCallBacks but using an additional level of indirection to
 *     indicate the subType.
 */
export const visitOperationSub = transformer.visitNodeSpecific.bind(transformer);

/**
 * Async variant of {@link visitOperationSub}, accepting promise-returning callbacks and returning a Promise.
 * Both the preVisitor and the visitor of every callback may return a promise, which is awaited before the
 * traversal continues. The traversal stays strictly sequential (depth-first): siblings are not visited
 * concurrently, so the callbacks observe the exact same order as the synchronous {@link visitOperationSub}.
 * The subType dispatch caveat on {@link mapOperationSub} applies here too.
 */
export const visitOperationSubAsync = transformer.visitNodeSpecificAsync.bind(transformer);

/**
 * Detects all in-scope variables.
 * In practice this means iterating through the entire algebra tree, finding all variables,
 * and stopping when a project function is found.
 * @param {Operation} op Input algebra tree.
 * @param visitor the visitor to be used to traverse the various nodes.
 *        Allows you to provide a visitor with different default preVisitor cotexts.
 * @returns {RDF.Variable[]} List of unique in-scope variables.
 */
export const inScopeVariables: typeof algebraUtils.inScopeVariables =
  (op: Operation, visitor = <typeof algebraUtils.visitOperation>visitOperation): RDF.Variable[] =>
    algebraUtils.inScopeVariables(op, visitor);

/**
 * Returns an operation with an always-defined metadata property.
 */
export function withMetadata<T extends Operation>(op: T): T & { metadata: Record<string, unknown> } {
  op.metadata ??= {};
  return <T & { metadata: Record<string, unknown> }> op;
}
