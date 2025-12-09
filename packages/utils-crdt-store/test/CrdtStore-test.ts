import { expect } from '@playwright/test';
import type { BaseQuad, Quad, Store, Term } from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { wrap } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { CRDT, CrdtStore } from '../lib';
import { basicTestStore, prefix } from './data';

function getStore<Q extends BaseQuad = Quad>(crdt: CrdtStore<Q>): Store<Q> {
  return (<any> crdt).store;
}

function getIter<Q extends BaseQuad = Quad>(crdt: CrdtStore<Q>): AsyncIterator<Q> {
  return wrap(crdt.match());
}

function getStoreIter<Q extends BaseQuad = Quad>(crdt: CrdtStore<Q>): AsyncIterator<Q> {
  return wrap(getStore(crdt).match());
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
  const DF = new DataFactory();

  it('filters out CRDT triples', async() => {
    const store = basicTestStore(DF);
    const crdt = new CrdtStore(store, DF);

    await expect(wrap(store.match()).toArray()).resolves.toHaveLength(4);
    await expect(wrap(crdt.match()).toArray()).resolves.toHaveLength(1);
  });

  it('is idempotent', async() => {
    const crdt1 = new CrdtStore(basicTestStore(DF), DF);
    const crdt2 = new CrdtStore(basicTestStore(DF), DF);

    await crdt1.crdtMerge(crdt2);
    await expect(wrap(crdt1.match()).toArray()).resolves.toHaveLength(1);
    await expect(wrap(getStore(crdt1).match()).toArray()).resolves.toHaveLength(4);

    await expect(getStoreIter(crdt1).toArray()
      .then(x => x.sort(compareTerm)))
      .resolves.toEqual((await getStoreIter(crdt2).toArray()).sort(compareTerm));
  });

  it('registers removal', async() => {
    const crdt1 = new CrdtStore(basicTestStore(DF), DF);
    const crdt2 = new CrdtStore(basicTestStore(DF), DF);

    await new Promise((resolve, reject) =>
      crdt1.removeMatches(null, null, null).on('end', resolve).on('error', reject));
    await expect(wrap(getStore(crdt1).match()).toArray()).resolves.toHaveLength(3);
    await expect(wrap(getStore(crdt1).match(null, DF.namedNode(CRDT.DELETE))).toArray()).resolves.toHaveLength(2);

    await crdt1.crdtMerge(crdt2);
    await expect(wrap(getStore(crdt1).match()).toArray()).resolves.toHaveLength(3);
    await expect(getIter(crdt1).toArray()).resolves.toHaveLength(0);
  });

  it('registers addition', async() => {
    const crdt1 = new CrdtStore(basicTestStore(DF), DF);
    const crdt2 = new CrdtStore(basicTestStore(DF), DF);
    await new Promise((resolve, reject) =>
      crdt1.removeMatches(null, null, null).on('end', resolve).on('error', reject));
    await crdt1.crdtMerge(crdt2);

    await new Promise((resolve, reject) => crdt1.import(wrap([
      DF.quad(DF.namedNode(`${prefix}a`), DF.namedNode(`${prefix}b`), DF.namedNode(`${prefix}c`)),
    ])).on('end', resolve).on('error', reject));
    await expect(getIter(crdt1).toArray()).resolves.toHaveLength(1);
    await expect(getStoreIter(crdt1).toArray()).resolves.toHaveLength(5);
  });
});
