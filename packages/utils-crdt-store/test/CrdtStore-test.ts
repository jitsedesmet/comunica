import { expect } from '@playwright/test';
import type { BaseQuad, Quad, Store, Term } from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { wrap } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { CRDT, CrdtStore } from '../lib';
import { DataFactoryUuid } from '../lib/DataFactoryUuid';
import { basicTestStore, prefix } from './data';

function getStore<Q extends BaseQuad = Quad>(crdt: CrdtStore<Q>): Store<Q> {
  return (<any> crdt).store;
}

function getIter<Q extends BaseQuad = Quad>(crdt: CrdtStore<Q>): AsyncIterator<Q> {
  return wrap(crdt.match());
}

function getStoreIter<Q extends BaseQuad = Quad>(
  crdt: CrdtStore<Q>,
  ...rest: Parameters<CrdtStore<Q>['match']>
): AsyncIterator<Q> {
  return wrap(getStore(crdt).match(...rest));
}

function termString(term: Term): string {
  switch (term.termType) {
    case 'Quad':
      return `${termString(term.subject)};${termString(term.predicate)};${termString(term.object)}`;
    default:
      return `${term.termType}${term.value}`;
  }
}

function compareTerm(a: Term, b: Term): number {
  return termString(a).localeCompare(termString(b));
}

describe('Crdt Store', () => {
  const DF = new DataFactoryUuid();

  it('filters out CRDT triples', async() => {
    const store = basicTestStore(DF);
    const crdt = new CrdtStore(store, DF);

    await expect(wrap(store.match()).toArray()).resolves.toHaveLength(4);
    await expect(wrap(crdt.match()).toArray()).resolves.toHaveLength(1);
  });

  it('is idempotent', async() => {
    for (let times = 0; times < 10; times++) {
      const store = basicTestStore(DF);
      const crdt1 = new CrdtStore(store, DF);
      // When not running the merge, blank node labels otherwise differ
      const crdt2 = new CrdtStore(times ? basicTestStore(DF) : store, DF);

      for (let i = 0; i < times; i++) {
        await crdt1.crdtMerge(crdt2);
      }
      await expect(wrap(crdt1.match()).toArray()).resolves.toHaveLength(1);
      await expect(wrap(getStore(crdt1).match()).toArray()).resolves.toHaveLength(4);

      await expect(getStoreIter(crdt1).toArray()
        .then(x => x.sort(compareTerm)), `running ${times}x`)
        .resolves.toEqual((await getStoreIter(crdt2).toArray()).sort(compareTerm));
    }
  });

  it('registers removal', async() => {
    for (let times = 1; times < 10; times++) {
      const crdt1 = new CrdtStore(basicTestStore(DF), DF);
      const crdt2 = new CrdtStore(basicTestStore(DF), DF);

      // Test idempotence remove
      for (let i = 0; i < times; i++) {
        await new Promise((resolve, reject) =>
          crdt1.removeMatches(null, null, null).on('end', resolve).on('error', reject));
      }
      await expect(wrap(getStore(crdt1).match()).toArray()).resolves.toHaveLength(3);
      await expect(wrap(getStore(crdt1).match(null, DF.namedNode(CRDT.DELETE))).toArray()).resolves.toHaveLength(2);

      await crdt1.crdtMerge(crdt2);
      await expect(wrap(getStore(crdt1).match()).toArray()).resolves.toHaveLength(3);
      await expect(getIter(crdt1).toArray()).resolves.toHaveLength(0);
    }
  });

  it('registers addition', async() => {
    for (let times = 1; times < 10; times++) {
      const crdt1 = new CrdtStore(basicTestStore(DF), DF);
      const crdt2 = new CrdtStore(basicTestStore(DF), DF);
      await new Promise((resolve, reject) =>
        crdt1.removeMatches(null, null, null).on('end', resolve).on('error', reject));
      await crdt1.crdtMerge(crdt2);

      // Test add external idempotence, internal non-idempotence
      for (let i = 0; i < times; i++) {
        await new Promise((resolve, reject) => crdt1.import(wrap([
          DF.quad(DF.namedNode(`${prefix}a`), DF.namedNode(`${prefix}b`), DF.namedNode(`${prefix}c`)),
        ])).on('end', resolve).on('error', reject));
      }
      await expect(getIter(crdt1).toArray()).resolves.toHaveLength(1);
      await expect(getStoreIter(crdt1).toArray()).resolves.toHaveLength(4 + times);

      const inner1 = await getStoreIter(crdt1).toArray();
      await crdt1.crdtMerge(crdt2);
      // Crdt1 should be unchanged
      await expect(getStoreIter(crdt1).toArray().then(x => x.sort(compareTerm)))
        .resolves.toEqual(inner1.sort(compareTerm));

      // CRDT2 is different to CRDT1
      await expect(getStoreIter(crdt1).toArray().then(x => x.sort(compareTerm)))
        .resolves.not.toEqual((await getStoreIter(crdt2).toArray()).sort(compareTerm));

      // After merging CRDT1 in CRDT2 - they will be equal
      await crdt2.crdtMerge(crdt1);
      await expect(getStoreIter(crdt1).toArray().then(x => x.sort(compareTerm)))
        .resolves.toEqual((await getStoreIter(crdt2).toArray()).sort(compareTerm));
    }
  });

  it('does not break merge when adding to both CRDTs', async() => {
    const failTest = false;
    const DF1 = failTest ? new DataFactory({ blankNodePrefix: 'bnode' }) : new DataFactoryUuid();
    const DF2 = failTest ? new DataFactory({ blankNodePrefix: 'bnode' }) : new DataFactoryUuid();
    const crdt1 = new CrdtStore(basicTestStore(DF1), DF1);
    await expect(getStoreIter(crdt1).toArray()).resolves.toHaveLength(4);
    const crdt2 = new CrdtStore(basicTestStore(DF2), DF2);

    // Separate DFs result in same construction
    if (failTest) {
      await expect(getStoreIter(crdt1).toArray().then(x => x.sort(compareTerm)))
        .resolves.toEqual((await getStoreIter(crdt2).toArray()).sort(compareTerm));
    }

    await new Promise((resolve, reject) =>
      crdt1.import(wrap([ DF.quad(DF.namedNode(`${prefix}a`), DF.namedNode(`${prefix}a`), DF.namedNode(`${prefix}a`)) ]))
        .on('end', resolve).on('error', reject));
    await new Promise((resolve, reject) =>
      crdt2.import(wrap([ DF.quad(DF.namedNode(`${prefix}b`), DF.namedNode(`${prefix}b`), DF.namedNode(`${prefix}b`)) ]))
        .on('end', resolve).on('error', reject));
    await expect(getStoreIter(crdt1).toArray()).resolves.toHaveLength(7);
    await expect(getStoreIter(crdt2).toArray()).resolves.toHaveLength(7);
    await expect(getStoreIter(crdt1).toArray().then(x => x.sort(compareTerm)))
      .resolves.not.toEqual((await getStoreIter(crdt2).toArray()).sort(compareTerm));
    await crdt1.crdtMerge(crdt2);
    await expect(getStoreIter(crdt1).toArray()).resolves.toHaveLength(10);
    // After merging, the structure should still be correct.
    // (Each reifies has a different node (definition of blank node usage))
    const taggers = await getStoreIter(crdt1, null, DF.namedNode(CRDT.TAGGING)).toArray();
    const taggersSet = new Set<string>();
    for (const tagger of taggers) {
      (
        taggersSet.add(termString(tagger.subject))
      );
    }
    expect(taggersSet.size).toBeGreaterThan(0);
    expect(taggersSet.size).toEqual(taggers.length);
  });
});
