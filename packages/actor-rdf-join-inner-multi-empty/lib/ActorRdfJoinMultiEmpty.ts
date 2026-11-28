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
import type { ComunicaDataFactory, IJoinEntry } from '@comunica/types';
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
    });
    this.mediatorJoin = args.mediatorJoin;
  }

  /**
   * Read the first item of a stream, leaving all later items in the stream.
   * @param stream A stream.
   * @return The first item, or null if the stream ends without items.
   */
  public static readFirstItem<T>(stream: AsyncIterator<T>): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const removeListeners = (): void => {
        stream.removeListener('readable', tryRead);
        stream.removeListener('end', onEnd);
        stream.removeListener('error', onError);
      };
      const tryRead = (): void => {
        const item = stream.read();
        if (item !== null) {
          removeListeners();
          resolve(item);
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
   * Restore the first bindings that were read from an entry, and mark the entry as non-empty.
   * @param entry A join entry with an estimated cardinality of zero.
   * @param firstBindings The bindings that were read from the entry.
   * @return The join entry, producing all of its bindings, with a cardinality of at least one.
   */
  public static restoreReadEntry(entry: IJoinEntry, firstBindings: RDF.Bindings): IJoinEntry {
    const { output } = entry;
    return {
      operation: entry.operation,
      output: {
        ...output,
        bindingsStream: output.bindingsStream.prepend([ firstBindings ]),
        async metadata() {
          const metadata = await output.metadata();
          return {
            ...metadata,
            cardinality: { ...metadata.cardinality, value: Math.max(1, metadata.cardinality.value) },
          };
        },
      },
    };
  }

  protected override async getOutput(
    action: IActionRdfJoin,
    sideData: IActorRdfJoinTestSideData,
  ): Promise<IActorRdfJoinOutputInner> {
    if (!sideData.metadatas.some(metadata => isCardinalityExactlyEmpty(metadata.cardinality))) {
      const estimatedEmptyIndex = sideData.metadatas.findIndex(metadata => metadata.cardinality.value === 0);
      const estimatedEmptyEntry = action.entries[estimatedEmptyIndex];
      const firstBindings = await ActorRdfJoinMultiEmpty.readFirstItem(estimatedEmptyEntry.output.bindingsStream);
      if (firstBindings) {
        const entries = [ ...action.entries ];
        entries[estimatedEmptyIndex] = ActorRdfJoinMultiEmpty.restoreReadEntry(estimatedEmptyEntry, firstBindings);
        return { result: await this.mediatorJoin.mediate({ ...action, entries }) };
      }
    }

    for (const entry of action.entries) {
      entry.output.bindingsStream.close();
    }

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
    if (!sideData.metadatas.some(metadata => metadata.cardinality.value === 0)) {
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
