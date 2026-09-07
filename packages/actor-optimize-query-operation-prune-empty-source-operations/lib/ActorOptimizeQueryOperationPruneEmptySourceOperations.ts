import type {
  IActionOptimizeQueryOperation,
  IActorOptimizeQueryOperationOutput,
  IActorOptimizeQueryOperationArgs,
} from '@comunica/bus-optimize-query-operation';
import { ActorOptimizeQueryOperation } from '@comunica/bus-optimize-query-operation';
import { KeysInitQuery, KeysQuerySourceIdentify } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import type {
  ComunicaDataFactory,
  IActionContext,
  IQuerySourceWrapper,
  MetadataBindings,
  QueryResultCardinality,
} from '@comunica/types';
import { Algebra, AlgebraFactory, algebraUtils, isKnownOperation } from '@comunica/utils-algebra';
import { doesShapeAcceptOperation, getOperationSource } from '@comunica/utils-query-operation';

/**
 * A comunica Prune Empty Source Operations Optimize Query Operation Actor.
 */
export class ActorOptimizeQueryOperationPruneEmptySourceOperations extends ActorOptimizeQueryOperation {
  private readonly useAskIfSupported: boolean;

  public constructor(args: IActorOptimizeQueryOperationPruneEmptySourceOperationsArgs) {
    super(args);
    this.useAskIfSupported = args.useAskIfSupported;
  }

  public async test(action: IActionOptimizeQueryOperation): Promise<TestResult<IActorTest>> {
    if (getOperationSource(action.operation)) {
      return failTest(`Actor ${this.name} does not work with top-level operation sources.`);
    }
    return passTestVoid();
  }

  public async run(action: IActionOptimizeQueryOperation): Promise<IActorOptimizeQueryOperationOutput> {
    const dataFactory: ComunicaDataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
    const algebraFactory = new AlgebraFactory(dataFactory);

    let prunedOperations = 0;

    const operation = await algebraUtils.mapOperationAsync(action.operation, {
      // Only consider unions of patterns or alts of links, since these are created during exhaustive
      // source assignment.
      [Algebra.Types.UNION]: { transform: async(unionOp) => {
        const { operation: pruned, emptyInputs } = await this.pruneEmptyInputs(
          dataFactory,
          algebraFactory,
          unionOp,
          Algebra.Types.PATTERN,
          children => algebraFactory.createUnion(children),
          action.context,
        );
        prunedOperations += emptyInputs;
        return pruned;
      } },
      [Algebra.Types.ALT]: {
        preVisitor: () => ({ continue: false }),
        transform: async(altOp) => {
          const { operation: pruned, emptyInputs } = await this.pruneEmptyInputs(
            dataFactory,
            algebraFactory,
            altOp,
            Algebra.Types.LINK,
            children => algebraFactory.createAlt(children),
            action.context,
          );
          prunedOperations += emptyInputs;
          return pruned;
        },
      },
      [Algebra.Types.SERVICE]: { preVisitor: () => ({ continue: false }) },
      // Operations within FROM (NAMED) are evaluated over a different dataset than the source's default dataset.
      // Their graphs are only rewritten when the FROM operation is executed,
      // so emptiness checks against the source would be done on the wrong graphs here.
      [Algebra.Types.FROM]: { preVisitor: () => ({ continue: false }) },

      // Remove operations that have become empty now due to missing variables
      [Algebra.Types.PROJECT]: {
        transform: (subOperation) => {
          // Remove projections that have become empty now due to missing variables
          if (ActorOptimizeQueryOperationPruneEmptySourceOperations.hasEmptyOperation(subOperation)) {
            return algebraFactory.createUnion([]);
          }
          return subOperation;
        },
      },
      [Algebra.Types.LEFT_JOIN]: { transform: (subOperation) => {
        // Remove left joins with empty right operation
        if (ActorOptimizeQueryOperationPruneEmptySourceOperations.hasEmptyOperation(subOperation.input[1])) {
          return subOperation.input[0];
        }
        return subOperation;
      } },
    });

    if (prunedOperations > 0) {
      this.logDebug(action.context, `Pruning ${prunedOperations} source-specific operations`);
    }

    return { operation, context: action.context };
  }

  protected static hasEmptyOperation(operation: Algebra.Operation): boolean {
    // If union (or alt) is empty, consider it empty (`Array.every` on an empty array always returns true)
    // But if we find a union with multiple children,
    // *all* of the children must be empty before the full operation is considered empty.
    let emptyOperation = false;
    algebraUtils.visitOperation(operation, {
      [Algebra.Types.UNION]: { preVisitor: (unionOp) => {
        if (unionOp.input.every(subSubOperation => ActorOptimizeQueryOperationPruneEmptySourceOperations
          .hasEmptyOperation(subSubOperation))) {
          emptyOperation = true;
          return { shortcut: true };
        }
        return { continue: false };
      } },
      [Algebra.Types.LEFT_JOIN]: { preVisitor: (leftJoinOp) => {
        // Only recurse into left part of left-join
        if (ActorOptimizeQueryOperationPruneEmptySourceOperations.hasEmptyOperation(leftJoinOp.input[0])) {
          emptyOperation = true;
          return { shortcut: true };
        }
        return { continue: false };
      } },
      [Algebra.Types.ALT]: { preVisitor: (altOp) => {
        if (altOp.input.length === 0) {
          emptyOperation = true;
          return { shortcut: true };
        }
        return { continue: false };
      } },
    });
    return emptyOperation;
  }

  /**
   * Remove the inputs of the given union or alt that their source has no results for.
   * Only source-annotated inputs of the given type are checked, since those are the ones that exhaustive
   * source assignment creates.
   * @param dataFactory The data factory.
   * @param algebraFactory The algebra factory.
   * @param operation A union or alt operation.
   * @param inputType The type of input to check, patterns for a union and links for an alt.
   * @param multiOperationFactory Creates a new operation of the same kind around the remaining inputs.
   * @param context The query context.
   * @return The pruned operation, and how many inputs turned out to be empty.
   */
  protected async pruneEmptyInputs<O extends Algebra.Union | Algebra.Alt>(
    dataFactory: ComunicaDataFactory,
    algebraFactory: AlgebraFactory,
    operation: O,
    inputType: (Algebra.Pattern | Algebra.Link)['type'],
    multiOperationFactory: (input: O['input']) => Algebra.Operation,
    context: IActionContext,
  ): Promise<{ operation: Algebra.Operation; emptyInputs: number }> {
    // The sources of a single union or alt are checked concurrently
    const nonEmpty: boolean[] = await Promise.all(operation.input.map(async(input) => {
      const source = getOperationSource(input);
      if (!source || !isKnownOperation(input, inputType)) {
        return true;
      }
      const checkOperation = isKnownOperation(input, Algebra.Types.LINK) ?
        algebraFactory.createPattern(dataFactory.variable('s'), input.iri, dataFactory.variable('o')) :
        input;
      return this.hasSourceResults(algebraFactory, source, checkOperation, context);
    }));

    // Remove empty operations
    const nonEmptyInputs: Algebra.Operation[] = operation.input.filter((_input, index) => nonEmpty[index]);
    const emptyInputs = operation.input.length - nonEmptyInputs.length;
    if (emptyInputs === 0) {
      return { operation, emptyInputs };
    }
    if (nonEmptyInputs.length === 0) {
      return { operation: multiOperationFactory([]), emptyInputs };
    }
    if (nonEmptyInputs.length === 1) {
      return { operation: nonEmptyInputs[0], emptyInputs };
    }
    return { operation: multiOperationFactory(nonEmptyInputs), emptyInputs };
  }

  /**
   * Check if the given query operation will produce at least one result in the given source.
   * @param algebraFactory The algebra factory.
   * @param source A query source.
   * @param input A query operation.
   * @param context The query context.
   */
  public async hasSourceResults(
    algebraFactory: AlgebraFactory,
    source: IQuerySourceWrapper,
    input: Algebra.Operation,
    context: IActionContext,
  ): Promise<boolean> {
    const mergedContext = source.context ? context.merge(source.context) : context;
    const wildcardAcceptAllExtensionFunctions = mergedContext.get(KeysInitQuery.extensionFunctionsAlwaysPushdown);

    // Traversal contexts should never be considered empty at optimization time.
    if (mergedContext.get(KeysQuerySourceIdentify.traverse)) {
      return true;
    }

    // Prefer ASK over COUNT when instructed to, and the source allows it
    if (this.useAskIfSupported) {
      const askOperation = algebraFactory.createAsk(input);
      const askSupported = doesShapeAcceptOperation(
        await source.source.getSelectorShape(context),
        askOperation,
        { wildcardAcceptAllExtensionFunctions },
      );
      if (askSupported) {
        return source.source.queryBoolean(askOperation, mergedContext);
      }
    }

    // Fall back to sending the full operation, and extracting the cardinality from metadata
    const bindingsStream = source.source.queryBindings(input, mergedContext);
    const cardinality = await new Promise<QueryResultCardinality>((resolve, reject) => {
      bindingsStream.on('error', reject);
      bindingsStream.getProperty('metadata', (metadata: MetadataBindings) => {
        bindingsStream.destroy();
        resolve(metadata.cardinality);
      });
    });

    // If the cardinality is an estimate, such as from a VoID description,
    // verify it using ASK if the source supports it.
    // Since the VoID estimators in Comunica cannot produce false negatives, only positive assignments must be verified.
    if (cardinality.type === 'estimate' && cardinality.value > 0) {
      const askOperation = algebraFactory.createAsk(input);
      const askSupported = doesShapeAcceptOperation(
        await source.source.getSelectorShape(context),
        askOperation,
        { wildcardAcceptAllExtensionFunctions },
      );
      if (askSupported) {
        return source.source.queryBoolean(askOperation, mergedContext);
      }
    }

    return cardinality.value > 0;
  }
}

export interface IActorOptimizeQueryOperationPruneEmptySourceOperationsArgs extends IActorOptimizeQueryOperationArgs {
  /**
   * If true, ASK queries will be sent to the source instead of COUNT queries to check emptiness for patterns.
   * This will only be done for sources that accept ASK queries.
   * @default {false}
   */
  useAskIfSupported: boolean;
}
