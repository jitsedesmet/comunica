import type {
  IActionRdfJoin,
  IActorRdfJoinOutputInner,
  IActorRdfJoinArgs,
  IActorRdfJoinTestSideData,
  MediatorRdfJoin,
} from '@comunica/bus-rdf-join';
import { ActorRdfJoin } from '@comunica/bus-rdf-join';
import { KeysInitQuery } from '@comunica/context-entries';
import type { TestResult } from '@comunica/core';
import { passTestWithSideData, failTest } from '@comunica/core';
import type { IMediatorTypeJoinCoefficients } from '@comunica/mediatortype-join-coefficients';
import type {
  BindingsStream,
  ComunicaDataFactory,
  IJoinEntry,
  IPhysicalQueryPlanLogger,
  MetadataBindings,
} from '@comunica/types';
import { isCardinalityExactlyEmpty, MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { ArrayIterator } from 'asynciterator';

/**
 * A comunica Multi Empty RDF Join Actor.
 * It produces no results if an entry has a cardinality of zero.
 * Entries estimated to be empty are read first, as estimators may underestimate.
 */
export class ActorRdfJoinMultiEmpty extends ActorRdfJoin {
  public readonly mediatorJoin: MediatorRdfJoin;

  public constructor(args: IActorRdfJoinMultiEmptyArgs) {
    super(args, {
      logicalType: 'inner',
      physicalName: 'multi-empty',
      canHandleUndefs: true,
      canHandleOperationRequired: true,
    });
    this.mediatorJoin = args.mediatorJoin;
  }

  /**
   * Find an entry with a cardinality of zero, preferring exact over estimated cardinalities.
   * Entries whose operation must be pushed into the join are skipped, as their output can not be read.
   * @param entries The join entries.
   * @param metadatas The metadata of the join entries.
   * @return The index of the found entry, or undefined if there is none.
   */
  public static findEmptyEntryIndex(entries: IJoinEntry[], metadatas: MetadataBindings[]): number | undefined {
    const readableIndexes = entries
      .map((entry, index) => index)
      .filter(index => !ActorRdfJoin.isOperationRequired(entries[index], metadatas[index]));
    return readableIndexes.find(index => isCardinalityExactlyEmpty(metadatas[index].cardinality)) ??
      readableIndexes.find(index => metadatas[index].cardinality.value === 0);
  }

  /**
   * Read the first item of a stream, and restore it in a new stream that produces all items.
   * @param stream A stream without listeners.
   * @return A stream producing all items of the given stream, or null if it ended without items.
   */
  public static readFirstItemAndRestream<T>(stream: AsyncIterator<T>): Promise<AsyncIterator<T> | null> {
    return new Promise((resolve, reject) => {
      const removeListeners = (): void => {
        stream.removeListener('readable', tryRead);
        stream.removeListener('end', onEnd);
        stream.removeListener('error', onError);
      };
      const tryRead = (): void => {
        const item = stream.read();
        if (item !== null) {
          // Restream before removing the listeners, as reading ahead may already cause errors.
          const restream = ActorRdfJoinMultiEmpty
            .deferErrorsUntilListened(stream.transform<T>({ prepend: [ item ], autoStart: false }));
          removeListeners();
          resolve(restream);
        } else if (stream.done) {
          onEnd();
        }
      };
      const onEnd = (): void => {
        removeListeners();
        resolve(null);
      };
      const onError = (error: Error): void => {
        removeListeners();
        reject(error);
      };
      stream.on('readable', tryRead);
      stream.on('end', onEnd);
      stream.on('error', onError);
      tryRead();
    });
  }

  /**
   * Hold back the first error of a stream until an error listener is attached, instead of throwing it.
   * @param stream A stream without error listeners.
   * @return The given stream.
   */
  public static deferErrorsUntilListened<T>(stream: AsyncIterator<T>): AsyncIterator<T> {
    let deferredError: Error | undefined;
    const deferError = (error: Error): void => {
      deferredError ??= error;
    };
    const onNewListener = (event: string): void => {
      if (event === 'error') {
        stream.removeListener('newListener', onNewListener);
        stream.removeListener('error', deferError);
        if (deferredError) {
          // The new listener is only attached after this event
          queueMicrotask(() => stream.emit('error', deferredError));
        }
      }
    };
    stream.on('error', deferError);
    stream.on('newListener', onNewListener);
    return stream;
  }

  /**
   * Replace the output of an entry estimated to be empty by one that turned out to produce results.
   * @param entry A join entry with an estimated cardinality of zero.
   * @param bindingsStream A stream producing all bindings of the entry.
   * @return The join entry with the given stream, and an unknown cardinality if it was estimated to be zero.
   */
  public static replaceUnderestimatedEntryStream(entry: IJoinEntry, bindingsStream: BindingsStream): IJoinEntry {
    const { output } = entry;
    return {
      ...entry,
      output: {
        ...output,
        bindingsStream,
        async metadata() {
          // The replaced stream can not seek, and its cardinality may be off by any amount
          const { canSeek: _canSeek, ...metadata } = await output.metadata();
          return metadata.cardinality.value === 0 ?
              { ...metadata, cardinality: { type: 'estimate', value: Number.POSITIVE_INFINITY }} :
            metadata;
        },
      },
    };
  }

  /**
   * Destroy the streams of join entries that will not be read anymore.
   * @param entries Join entries.
   */
  public static destroyEntries(entries: IJoinEntry[]): void {
    for (const entry of entries) {
      entry.output.bindingsStream.destroy();
    }
  }

  protected override async getOutput(
    action: IActionRdfJoin,
    sideData: IActorRdfJoinTestSideData,
  ): Promise<IActorRdfJoinOutputInner> {
    const emptyEntryIndex = ActorRdfJoinMultiEmpty.findEmptyEntryIndex(action.entries, sideData.metadatas)!;
    const emptyEntry = action.entries[emptyEntryIndex];
    if (!isCardinalityExactlyEmpty(sideData.metadatas[emptyEntryIndex].cardinality)) {
      let restream: BindingsStream | null;
      try {
        restream = await ActorRdfJoinMultiEmpty.readFirstItemAndRestream(emptyEntry.output.bindingsStream);
      } catch (error: unknown) {
        ActorRdfJoinMultiEmpty.destroyEntries(action.entries);
        throw error;
      }
      if (restream) {
        const entries = [ ...action.entries ];
        entries[emptyEntryIndex] = ActorRdfJoinMultiEmpty.replaceUnderestimatedEntryStream(emptyEntry, restream);
        // Let the join that receives the replaced output adopt the plan node of the original output
        action.context.get<IPhysicalQueryPlanLogger>(KeysInitQuery.physicalQueryPlanLogger)
          ?.getNodeForOutput(emptyEntry.output)?.setOutput(entries[emptyEntryIndex].output);
        return { result: await this.mediatorJoin.mediate({ ...action, entries }) };
      }
    }

    ActorRdfJoinMultiEmpty.destroyEntries(action.entries);
    const dataFactory: ComunicaDataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
    return {
      result: {
        bindingsStream: new ArrayIterator<RDF.Bindings>([], { autoStart: false }),
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { type: 'exact', value: 0 },
          variables: ActorRdfJoin.joinVariables(dataFactory, sideData.metadatas),
        }),
        type: 'bindings',
      },
    };
  }

  protected async getJoinCoefficients(
    action: IActionRdfJoin,
    sideData: IActorRdfJoinTestSideData,
  ): Promise<TestResult<IMediatorTypeJoinCoefficients, IActorRdfJoinTestSideData>> {
    if (ActorRdfJoinMultiEmpty.findEmptyEntryIndex(action.entries, sideData.metadatas) === undefined) {
      return failTest(`Actor ${this.name} can only join entries where at least one has a cardinality of zero`);
    }
    return passTestWithSideData({
      iterations: 0,
      persistedItems: 0,
      blockingItems: 0,
      requestTime: 0,
    }, sideData);
  }
}

export interface IActorRdfJoinMultiEmptyArgs extends IActorRdfJoinArgs {
  /**
   * The join mediator, used when an entry estimated to be empty turns out to produce results.
   */
  mediatorJoin: MediatorRdfJoin;
}
