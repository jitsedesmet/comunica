import type { IActionRdfJoin } from '@comunica/bus-rdf-join';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext, IJoinEntry } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator, TransformIterator } from 'asynciterator';
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
): IJoinEntry {
  return {
    output: {
      type: 'bindings',
      bindingsStream: new ArrayIterator(bindings, { autoStart: false }),
      metadata: async() => <any> ({ cardinality, variables: [{ variable: DF.variable('a'), canBeUndef: false }]}),
    },
    operation: <any> {},
  };
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

  describe('run', () => {
    it('should return an empty stream for an exact cardinality of zero without reading entries', async() => {
      const entries = [
        entryWithCardinality({ type: 'estimate', value: 10 }, [ bindingsA1 ]),
        entryWithCardinality({ type: 'exact', value: 0 }, [ bindingsA2 ]),
      ];
      const output = await run(entries);
      await expect(output.bindingsStream).toEqualBindingsStream([]);
      await expect(output.metadata()).resolves.toMatchObject({
        cardinality: { type: 'exact', value: 0 },
        variables: [{ variable: DF.variable('a'), canBeUndef: false }],
      });
      expect(entries[0].output.bindingsStream.closed).toBe(true);
      expect(entries[1].output.bindingsStream.closed).toBe(true);
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
      expect(entries[0].output.bindingsStream.closed).toBe(true);
      expect(mediatorJoin.mediate).not.toHaveBeenCalled();
    });

    it('should delegate to the join mediator for an estimated cardinality of zero of a non-empty entry', async() => {
      const entries = [
        entryWithCardinality({ type: 'estimate', value: 0 }, [ bindingsA1, bindingsA2 ]),
        entryWithCardinality({ type: 'estimate', value: 10 }, [ bindingsA1 ]),
      ];
      const output = await run(entries);
      await expect(output.bindingsStream).toEqualBindingsStream([ bindingsA1, bindingsA2 ]);
      await expect(output.metadata()).resolves.toMatchObject({ cardinality: { type: 'estimate', value: 1 }});
      const delegatedEntries: IJoinEntry[] = mediatorJoin.mediate.mock.calls[0][0].entries;
      expect(delegatedEntries[1]).toBe(entries[1]);
      expect(entries[1].output.bindingsStream.closed).toBe(false);
    });
  });

  describe('readFirstItem', () => {
    it('should read an item that is available immediately', async() => {
      const stream = new ArrayIterator([ 1, 2 ], { autoStart: false });
      await expect(ActorRdfJoinMultiEmpty.readFirstItem(stream)).resolves.toBe(1);
      await expect(stream.toArray()).resolves.toEqual([ 2 ]);
    });

    it('should wait for an item that becomes available later', async() => {
      const stream = new TransformIterator<number>(
        Promise.resolve(new ArrayIterator([ 1, 2 ], { autoStart: false })),
        { autoStart: false },
      );
      await expect(ActorRdfJoinMultiEmpty.readFirstItem(stream)).resolves.toBe(1);
      await expect(stream.toArray()).resolves.toEqual([ 2 ]);
    });

    it('should be null for a stream that ends without items', async() => {
      const stream = new TransformIterator<number>(
        Promise.resolve(new ArrayIterator<number>([], { autoStart: false })),
        { autoStart: false },
      );
      await expect(ActorRdfJoinMultiEmpty.readFirstItem(stream)).resolves.toBeNull();
    });

    it('should be null for a stream that already ended', async() => {
      const stream = new ArrayIterator<number>([], { autoStart: false });
      await expect(stream.toArray()).resolves.toEqual([]);
      await expect(ActorRdfJoinMultiEmpty.readFirstItem(stream)).resolves.toBeNull();
    });

    it('should reject for an erroring stream', async() => {
      const stream = new TransformIterator<number>(Promise.reject(new Error('stream error')), { autoStart: false });
      await expect(ActorRdfJoinMultiEmpty.readFirstItem(stream)).rejects.toThrow('stream error');
    });
  });

  describe('restoreReadEntry', () => {
    it('should keep a non-zero cardinality reported after reading', async() => {
      const entry = entryWithCardinality({ type: 'estimate', value: 5 }, [ bindingsA2 ]);
      const restoredEntry = ActorRdfJoinMultiEmpty.restoreReadEntry(entry, bindingsA1);
      await expect(restoredEntry.output.metadata()).resolves
        .toMatchObject({ cardinality: { type: 'estimate', value: 5 }});
      await expect(restoredEntry.output.bindingsStream).toEqualBindingsStream([ bindingsA1, bindingsA2 ]);
      expect(restoredEntry.operation).toBe(entry.operation);
    });
  });
});
