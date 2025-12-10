import { DataFactoryUuid } from '../lib/DataFactoryUuid';
import { WebSyncedStore } from '../lib/WebSyncedStore';
import { getStoreIter } from './uitils';

describe('Crdt Store', () => {
  const DF = new DataFactoryUuid();

  it('filters out CRDT triples', async() => {
    const crdt = new WebSyncedStore({ dataFactory: DF, webSource: 'http://localhost:3000/test.nq' });
    await crdt.pullData();
    await expect(getStoreIter(crdt).toArray()).resolves.toHaveLength(4);
  });
});
