import type { BaseQuad, Quad, Store, Term } from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { wrap } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { CrdtStore } from '../lib';
import { basicTestStore } from './data';

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
    const store = basicTestStore(DF);
    const crdt1 = new CrdtStore(store, DF);
    const crdt2 = new CrdtStore(store, DF);

    await crdt1.crdtMerge(crdt2);
    await expect(wrap(crdt1.match()).toArray()).resolves.toHaveLength(1);
    await expect(wrap(getStore(crdt1).match()).toArray()).resolves.toHaveLength(4);

    await expect(getStoreIter(crdt1).toArray()
      .then(x => x.sort(compareTerm)))
      .resolves.toEqual((await getStoreIter(crdt2).toArray()).sort(compareTerm));
  });
});
