import type { IActionRdfJoin } from '@comunica/bus-rdf-join';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { BindingsStream, IActionContext, IJoinEntry, MetadataBindings } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { ArrayIterator, BufferedIterator, TransformIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfJoinMultiEmpty } from '../lib/ActorRdfJoinMultiEmpty';
import '@comunica/utils-jest';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);

const bindingsA1 = BF.bindings([[ DF.variable('a'), DF.literal('1') ]]);
const bindingsA2 = BF.bindings([[ DF.variable('a'), DF.literal('2') ]]);

function entryWithCardinality(
  cardinality: RDF.QueryResultCardinality,
  bindings: RDF.Bindings[] = [],
  extraMetadata: Partial<MetadataBindings> = {},
): IJoinEntry {
  return {
    output: {
      type: 'bindings',
      bindingsStream: new ArrayIterator(bindings, { autoStart: false }),
      metadata: async() => <any> ({
        cardinality,
        variables: [{ variable: DF.variable('a'), canBeUndef: false }],
        ...extraMetadata,
      }),
    },
    operation: <any> {},
  };
}

/**
 * A stream that produces one item, and then fails when reading ahead for the next one.
 */
class FailingAfterFirstItemIterator extends BufferedIterator<number> {
  private reads = 0;

  public constructor() {
    super({ autoStart: false });
  }

  public override _read(count: number, done: () => void): void {
    this.reads++;
    if (this.reads === 1) {
      this._push(1);
    } else {
      this.emit('error', new Error('second item failed'));
    }
    done();
  }
}

describe('ActorRdfJoinMultiEmpty', () => {
  let mediatorJoin: any;
  let actor: ActorRdfJoinMultiEmpty;
  let context: IActionContext;

  beforeEach(() => {
    mediatorJoin = {
      mediate: jest.fn(async(action: IActionRdfJoin) => ({
        type: 'bindings',
        bindingsStream: action.entries[0].output.bindingsStream,
        metadata: action.entries[0].output.metadata,
      })),
    };
    actor = new ActorRdfJoinMultiEmpty({
      name: 'actor',
      bus: new Bus({ name: 'bus' }),
      mediatorJoinSelectivity: <any> { mediate: async() => ({ selectivity: 1 }) },
      mediatorJoin,
    });
    context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
  });

  async function run(entries: IJoinEntry[]): Promise<any> {
    const action: IActionRdfJoin = { type: 'inner', entries, context };
    return actor.run(action, (await actor.test(action)).getSideData());
  }

  describe('test', () => {
    it('should not test without an entry with a cardinality of zero', async() => {
      await expect(actor.test({
        type: 'inner',
        entries: [
          entryWithCardinality({ type: 'estimate', value: 10 }),
          entryWithCardinality({ type: 'exact', value: 15 }),
        ],
        context,
      })).resolves.toFailTest('Actor actor can only join entries where at least one has a cardinality of zero');
    });

    it.each([ 'exact', 'estimate' ])('should test with an %s cardinality of zero', async(type) => {
      await expect(actor.test({
        type: 'inner',
        entries: [
          entryWithCardinality({ type: 'estimate', value: 10 }),
          entryWithCardinality({ type: <any> type, value: 0 }),
        ],
        context,
      })).resolves.toPassTest({
        iterations: 0,
        persistedItems: 0,
        blockingItems: 0,
        requestTime: 0,
      });
    });
  });

  describe('findEmptyEntryIndex', () => {
    async function findEmptyEntryIndex(entries: IJoinEntry[]): Promise<number | undefined> {
      return ActorRdfJoinMultiEmpty.findEmptyEntryIndex(entries, await Promise.all(entries
        .map(entry => entry.output.metadata())));
    }

    it('should prefer an exact over an estimated cardinality of zero', async() => {
      await expect(findEmptyEntryIndex([
        entryWithCardinality({ type: 'estimate', value: 0 }),
        entryWithCardinality({ type: 'exact', value: 0 }),
      ])).resolves.toBe(1);
    });

    it('should skip entries whose operation is required', async() => {
      await expect(findEmptyEntryIndex([
        { ...entryWithCardinality({ type: 'exact', value: 0 }), operationRequired: <const> true },
        entryWithCardinality({ type: 'exact', value: 0 }, [], { operationRequired: true }),
        entryWithCardinality({ type: 'estimate', value: 0 }),
      ])).resolves.toBe(2);
    });

    it('should be undefined without an entry with a cardinality of zero', async() => {
      await expect(findEmptyEntryIndex([
        entryWithCardinality({ type: 'estimate', value: 1 }),
      ])).resolves.toBeUndefined();
    });
  });

  describe('run', () => {
    it('should return an empty stream for an exact cardinality of zero without reading entries', async() => {
      const entries = [
        { ...entryWithCardinality({ type: 'estimate', value: 10 }, [ bindingsA1 ]), operationRequired: <const> true },
        entryWithCardinality({ type: 'exact', value: 0 }, [ bindingsA2 ]),
      ];
      const output = await run(entries);
      await expect(output.bindingsStream).toEqualBindingsStream([]);
      await expect(output.metadata()).resolves.toMatchObject({
        cardinality: { type: 'exact', value: 0 },
        variables: [{ variable: DF.variable('a'), canBeUndef: false }],
      });
      expect(entries[0].output.bindingsStream.destroyed).toBe(true);
      expect(entries[1].output.bindingsStream.destroyed).toBe(true);
      expect(mediatorJoin.mediate).not.toHaveBeenCalled();
    });

    it('should return an empty stream for an estimated cardinality of zero of an empty entry', async() => {
      const entries = [
        entryWithCardinality({ type: 'estimate', value: 10 }, [ bindingsA1 ]),
        entryWithCardinality({ type: 'estimate', value: 0 }),
      ];
      const output = await run(entries);
      await expect(output.bindingsStream).toEqualBindingsStream([]);
      await expect(output.metadata()).resolves.toMatchObject({ cardinality: { type: 'exact', value: 0 }});
      expect(entries[0].output.bindingsStream.destroyed).toBe(true);
      expect(mediatorJoin.mediate).not.toHaveBeenCalled();
    });

    it('should delegate to the join mediator for an estimated cardinality of zero of a non-empty entry', async() => {
      const entries = [
        entryWithCardinality({ type: 'estimate', value: 0 }, [ bindingsA1, bindingsA2 ]),
        entryWithCardinality({ type: 'estimate', value: 10 }, [ bindingsA1 ]),
      ];
      const output = await run(entries);
      await expect(output.bindingsStream).toEqualBindingsStream([ bindingsA1, bindingsA2 ]);
      await expect(output.metadata()).resolves
        .toMatchObject({ cardinality: { type: 'estimate', value: Number.POSITIVE_INFINITY }});
      const delegatedEntries: IJoinEntry[] = mediatorJoin.mediate.mock.calls[0][0].entries;
      expect(delegatedEntries[1]).toBe(entries[1]);
      expect(entries[1].output.bindingsStream.destroyed).toBe(false);
    });

    it('should move the plan node of a non-empty entry to its replaced output', async() => {
      const entries = [
        entryWithCardinality({ type: 'estimate', value: 0 }, [ bindingsA1 ]),
        entryWithCardinality({ type: 'estimate', value: 10 }, [ bindingsA1 ]),
      ];
      const entryPlanNode = { setOutput: jest.fn(), appendMetadata: jest.fn() };
      context = context.set(KeysInitQuery.physicalQueryPlanLogger, <any> {
        logOperation: () => ({ adoptInput: jest.fn(), setOutput: jest.fn(), appendMetadata: jest.fn() }),
        getNodeForOutput: (output: unknown) => output === entries[0].output ? entryPlanNode : undefined,
      });
      await run(entries);
      expect(entryPlanNode.setOutput)
        .toHaveBeenCalledWith(mediatorJoin.mediate.mock.calls[0][0].entries[0].output);
    });

    it('should destroy all entries if reading an entry estimated to be empty fails', async() => {
      const entries = [
        entryWithCardinality({ type: 'estimate', value: 0 }),
        entryWithCardinality({ type: 'estimate', value: 10 }, [ bindingsA1 ]),
      ];
      entries[0].output.bindingsStream = new TransformIterator(
        Promise.reject(new Error('read failed')),
        { autoStart: false },
      );
      await expect(run(entries)).rejects.toThrow('read failed');
      expect(entries[1].output.bindingsStream.destroyed).toBe(true);
    });
  });

  describe('readFirstItemAndRestream', () => {
    it('should restream an item that is available immediately', async() => {
      const stream = new ArrayIterator([ 1, 2 ], { autoStart: false });
      const restream = await ActorRdfJoinMultiEmpty.readFirstItemAndRestream(stream);
      await expect(restream!.toArray()).resolves.toEqual([ 1, 2 ]);
    });

    it('should wait for an item that becomes available later', async() => {
      const stream = new TransformIterator<number>(
        Promise.resolve(new ArrayIterator([ 1, 2 ], { autoStart: false })),
        { autoStart: false },
      );
      const restream = await ActorRdfJoinMultiEmpty.readFirstItemAndRestream(stream);
      await expect(restream!.toArray()).resolves.toEqual([ 1, 2 ]);
    });

    it('should be null for a stream that ends without items', async() => {
      const stream = new TransformIterator<number>(
        Promise.resolve(new ArrayIterator<number>([], { autoStart: false })),
        { autoStart: false },
      );
      await expect(ActorRdfJoinMultiEmpty.readFirstItemAndRestream(stream)).resolves.toBeNull();
    });

    it('should be null for a stream that already ended', async() => {
      const stream = new ArrayIterator<number>([], { autoStart: false });
      await expect(stream.toArray()).resolves.toEqual([]);
      await expect(ActorRdfJoinMultiEmpty.readFirstItemAndRestream(stream)).resolves.toBeNull();
    });

    it('should reject for a stream that fails before its first item', async() => {
      const stream = new TransformIterator<number>(Promise.reject(new Error('stream error')), { autoStart: false });
      await expect(ActorRdfJoinMultiEmpty.readFirstItemAndRestream(stream)).rejects.toThrow('stream error');
    });

    it('should pass errors after the first item to the consumer of the restream', async() => {
      const restream = await ActorRdfJoinMultiEmpty.readFirstItemAndRestream(new FailingAfterFirstItemIterator());
      await new Promise(resolve => setTimeout(resolve, 10));
      await expect(restream!.toArray()).rejects.toThrow('second item failed');
    });
  });

  describe('deferErrorsUntilListened', () => {
    let stream: AsyncIterator<number>;

    beforeEach(() => {
      stream = ActorRdfJoinMultiEmpty.deferErrorsUntilListened(new ArrayIterator([ 1 ], { autoStart: false }));
    });

    it('should emit an error once an error listener is attached', async() => {
      stream.on('end', () => {});
      stream.emit('error', new Error('early error'));
      await expect(new Promise(resolve => stream.on('error', resolve))).resolves.toEqual(new Error('early error'));
    });

    it('should not emit anything without an error', async() => {
      const errorListener = jest.fn();
      stream.on('error', errorListener);
      await expect(stream.toArray()).resolves.toEqual([ 1 ]);
      expect(errorListener).not.toHaveBeenCalled();
    });
  });

  describe('replaceUnderestimatedEntryStream', () => {
    it('should replace an estimated cardinality of zero by an unknown cardinality', async() => {
      const entry = {
        ...entryWithCardinality({ type: 'estimate', value: 0 }, [], { canSeek: true }),
        operationModified: <const> true,
      };
      const bindingsStream: BindingsStream = <any> new ArrayIterator([ bindingsA1 ], { autoStart: false });
      const replacedEntry = ActorRdfJoinMultiEmpty.replaceUnderestimatedEntryStream(entry, bindingsStream);
      expect(replacedEntry.output.bindingsStream).toBe(bindingsStream);
      expect(replacedEntry.operationModified).toBe(true);
      const metadata = await replacedEntry.output.metadata();
      expect(metadata.cardinality).toEqual({ type: 'estimate', value: Number.POSITIVE_INFINITY });
      expect(metadata.canSeek).toBeUndefined();
    });

    it('should keep a non-zero cardinality reported afterwards', async() => {
      const entry = entryWithCardinality({ type: 'estimate', value: 5 });
      const replacedEntry = ActorRdfJoinMultiEmpty
        .replaceUnderestimatedEntryStream(entry, <any> new ArrayIterator([], { autoStart: false }));
      await expect(replacedEntry.output.metadata()).resolves
        .toMatchObject({ cardinality: { type: 'estimate', value: 5 }});
    });
  });
});
