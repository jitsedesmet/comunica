import { wrap } from 'asynciterator';
import { DataFactoryUuid } from '../lib/DataFactoryUuid';
import { eventToPromise } from '../lib/utils';
import { WebSyncedStore } from '../lib/WebSyncedStore';
import { prefix } from './data';
import { getIter, getStoreIter } from './utils';

describe('Web Synced Store', () => {
  const DF = new DataFactoryUuid();

  it('Single store communication', async() => {
    const crdt = new WebSyncedStore({ dataFactory: DF, webSource: 'http://localhost:3000/test.nq' });
    await crdt.pullData();
    await expect(getStoreIter(crdt).toArray()).resolves.toHaveLength(4);

    await crdt.pushData();
  });

  it('store B can remove what A has created', async() => {
    const DF1 = new DataFactoryUuid();
    const DF2 = new DataFactoryUuid();
    const crdt1 = new WebSyncedStore({ dataFactory: DF1, webSource: 'http://localhost:3000/test.nq' });
    // Clear server
    await crdt1.pullData();
    await eventToPromise(crdt1.removeMatches());
    await crdt1.pushData();
    await expect(getIter(crdt1).toArray()).resolves.toHaveLength(0);
    const crdt2 = new WebSyncedStore({ dataFactory: DF2, webSource: 'http://localhost:3000/test.nq' });

    // 1 makes, sends, 2 fetches and removes, 1 fetches and is removed
    // Test would fail using merge: if I or server has, I has (naive add-wins).
    const testTriple = DF.quad(DF.namedNode(`${prefix}a`), DF.namedNode(`${prefix}a`), DF.namedNode(`${prefix}a`));
    await eventToPromise(crdt1.import(wrap([ testTriple ])));
    await expect(getIter(crdt1).toArray()).resolves.toHaveLength(1);
    await crdt1.pushData();
    await crdt2.pullData();
    await eventToPromise(crdt2.removeMatches());
    await crdt2.pushData();
    await crdt1.pullData();

    await expect(getIter(crdt1).toArray()).resolves.toHaveLength(0);
  });

  it('store A adding and removing constantly, while B adds once, result in no remove', async() => {
    // Remote is now empty.
    const DF1 = new DataFactoryUuid();
    const DF2 = new DataFactoryUuid();
    const crdt1 = new WebSyncedStore({ dataFactory: DF1, webSource: 'http://localhost:3000/test.nq' });
    const crdt2 = new WebSyncedStore({ dataFactory: DF2, webSource: 'http://localhost:3000/test.nq' });
    await crdt1.pullData();
    await crdt2.pullData();

    const testTriple = DF.quad(DF.namedNode(`${prefix}b`), DF.namedNode(`${prefix}b`), DF.namedNode(`${prefix}b`));
    for (let i = 0; i < 10; i++) {
      await eventToPromise(crdt1.import(wrap([ testTriple ])));
      await eventToPromise(crdt1.removeMatches());
    }
    await eventToPromise(crdt2.import(wrap([ testTriple ])));
    await expect(getIter(crdt1).toArray()).resolves.toHaveLength(0);
    await expect(getIter(crdt2).toArray()).resolves.toHaveLength(1);

    await crdt1.pushData();
    await crdt2.pullData();
    await crdt2.pushData();
    await crdt1.pullData();
    await expect(getIter(crdt1).toArray()).resolves.toHaveLength(1);
    await expect(getIter(crdt2).toArray()).resolves.toHaveLength(1);
  });
});
