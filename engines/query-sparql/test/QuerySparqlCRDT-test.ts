/** @jest-environment setup-polly-jest/jest-environment-node */

import { DataFactoryUuid } from '@comunica/utils-crdt-store/lib/DataFactoryUuid';
import { WebSyncedStore } from '@comunica/utils-crdt-store/lib/WebSyncedStore';
import * as crdtTestHelpers from '@comunica/utils-crdt-store/test/utils';
import type * as RDF from '@rdfjs/types';
import 'jest-rdf';
import '@comunica/utils-jest';
import { RdfStore } from 'rdf-stores';
import { QueryEngine } from '../lib/QueryEngine';

describe('System test: QuerySparql', () => {
  let engineA: QueryEngine;
  let engineB: QueryEngine;
  beforeAll(() => {
    engineA = new QueryEngine();
    engineB = new QueryEngine();
  });

  /**
   * Clear the running webserver
   */
  async function clearRemote(): Promise<void> {
    const DF1 = new DataFactoryUuid();
    const crdtClear = new WebSyncedStore({ dataFactory: DF1, webSource: 'http://localhost:3000/test.nq' });
    // Clear server completely
    await crdtClear.pullData();
    (<any> crdtClear).store = RdfStore.createDefault();
    await crdtClear.pushData();
    await expect(crdtTestHelpers.getStoreIter(crdtClear).toArray()).resolves.toHaveLength(0);
  }

  function promiseWait(time: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, time));
  }

  it('two stores syncing data', async() => {
    await clearRemote();
    const DFA = new DataFactoryUuid();
    const DFB = new DataFactoryUuid();
    const crdtA = new WebSyncedStore({ dataFactory: DFA, webSource: 'http://localhost:3000/test.nq', webSyncInterval: 100 });
    const crdtB = new WebSyncedStore({ dataFactory: DFB, webSource: 'http://localhost:3000/test.nq', webSyncInterval: 150 });
    const longTime = 1000;
    await promiseWait(longTime);

    // Starting for a synced state, now add in store and engine A
    const result = <RDF.QueryVoid> await engineA.query(`INSERT DATA {
          <ex:s> <ex:p> <ex:o>.
        }`, {
      sources: [ crdtA ],
      destination: crdtA,
    });
    await result.execute();

    // When waiting a long time, both stores will have synced the server and seen the added triple
    await promiseWait(longTime);
    await expect(crdtTestHelpers.getIter(crdtA).toArray()).resolves.toHaveLength(1);
    await expect(crdtTestHelpers.getIter(crdtB).toArray()).resolves.toHaveLength(1);

    // This also reflects when querying using engine and store B
    const resQueryB = await engineB.queryBindings(`SELECT * { ?s ?p ?o }`, { sources: [ crdtB ]});
    await expect(resQueryB.toArray()).resolves.toHaveLength(1);

    // Stop synchronization of the stores, allowing program to exit
    await Promise.all([ crdtA.stop(), crdtB.stop() ]);
  });

  it('two stores working independently', async() => {
    await clearRemote();
    const DFA = new DataFactoryUuid();
    const DFB = new DataFactoryUuid();
    const crdtA = new WebSyncedStore({ dataFactory: DFA, webSource: 'http://localhost:3000/test.nq', webSyncInterval: 100 });
    const crdtB = new WebSyncedStore({ dataFactory: DFB, webSource: 'http://localhost:3000/test.nq', webSyncInterval: 150 });
    const longTime = 1000;
    await promiseWait(longTime);

    // A list of operation A will do (concurrently with B)
    const engineAExec = (async() => {
      const result = <RDF.QueryVoid> await engineA.query(`INSERT DATA {
          <ex:s> <ex:p> <ex:o>.
        }`, {
        sources: [ crdtA ],
        destination: crdtA,
      });
      await result.execute();

      // After waiting long, B removed the triple
      await promiseWait(longTime * 2);
      const bindings = await engineB.queryBindings(`SELECT * { ?s ?p ?o }`, { sources: [ crdtA ]});
      await expect(bindings.toArray()).resolves.toHaveLength(0);
    })();
    // Operations B will do (concurrent with B)
    const engineBExec = (async() => {
      // Query the data, will be empty because we have not syned
      let bindings = await engineB.queryBindings(`SELECT * { ?s ?p ?o }`, { sources: [ crdtB ]});
      await expect(bindings.toArray()).resolves.toHaveLength(0);

      // After waiting long, you will see the insert of A.
      await promiseWait(longTime);
      bindings = await engineB.queryBindings(`SELECT * { ?s ?p ?o }`, { sources: [ crdtB ]});
      await expect(bindings.toArray()).resolves.toHaveLength(1);

      // Now let's remove that insert
      const update = <RDF.QueryVoid> await engineA.query(`DELETE WHERE { ?s ?p ?o }`, {
        sources: [ crdtB ],
        destination: crdtB,
      });
      await update.execute();
      // Locally we see the disappearance.
      bindings = await engineB.queryBindings(`SELECT * { ?s ?p ?o }`, { sources: [ crdtB ]});
      await expect(bindings.toArray()).resolves.toHaveLength(0);
    })();

    // Sync point between A and B
    await Promise.all([ engineAExec, engineBExec ]);

    await Promise.all([ crdtA.stop(), crdtB.stop() ]);
  });
});
