/* eslint-disable import/no-nodejs-modules */
import { EventEmitter } from 'node:events';
import type { Quad, Store, Stream, Term, BaseQuad } from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { wrap } from 'asynciterator';
import type { DataFactory } from 'rdf-data-factory';
import { RdfStore } from 'rdf-stores';

export const prefixCrdt = 'https://rdf-set-crdt.knows.idlab.ugent.be/';

/**
 * <> a CRDT:CONTAINER .
 *
 * :a :b :c .
 * [] CRDT:TAGGING <<( :a :b :c )>> ;
 *    CRDT:ADD "10591359-7b29-44f1-99df-e2e2bbf53adc"^^CRDT:DT_UUID
 *    CRDT:DELETE "2010-06-21T11:28:01Z---b4074a77-f529-4bfc-95f5-008b2f777261"^^CRDT:DT_STAMP_UUID
 *    DELETE "c269c6ec-b9b5-487e-aa93-f118b5af6842"^^CRDT:DT_UUID
 */
export enum CRDT {
  CONTAINER = `https://rdf-set-crdt.knows.idlab.ugent.be/container`,
  TAGGING = `https://rdf-set-crdt.knows.idlab.ugent.be/tagging`,
  ADD = `https://rdf-set-crdt.knows.idlab.ugent.be/add`,
  DELETE = `https://rdf-set-crdt.knows.idlab.ugent.be/delete`,
  DT_UUID = `https://rdf-set-crdt.knows.idlab.ugent.be/uuid`,
  // TODO: future work: garbage collecting
  DT_STAMP_UUID = `https://rdf-set-crdt.knows.idlab.ugent.be/stamp-uuid`,
}

function termString(term: Term): string {
  // Works since no termType is a prefix of another termType
  // TODO: does not yet handle graphs!
  return `${term.termType}${term.value}`;
}

/**
 * Implementation of a state-based Set CRDT (SU-set).
 * Has an internal store that reflects the remote data,
 * but wraps around that store to be a front for what is exported outside.
 * Depends on https://github.com/rubensworks/rdf-dereference.js/
 */
export class CrdtStore<Q extends BaseQuad = Quad> implements Store<Q> {
  public constructor(private store: Store<Q>, private readonly DF: DataFactory<Q>) {}

  public deleteGraph(graph: Quad['graph'] | string): EventEmitter {
    return this.removeMatches(null, null, null, typeof graph === 'string' ? this.DF.namedNode(graph) : graph);
  }

  public import(stream: Stream<Q>): EventEmitter {
    // Import stream and verify tagging
    // TODO: tag the untagged
    return this.store.import(stream);
  }

  public match(
    subject?: Term | null,
    predicate?: Term | null,
    object?: Term | null,
    graph?: Term | null,
  ): Stream<Q> & AsyncIterator<Q> {
    // Just get the triples that are not dedicated to your management structure.
    const formStoreRes = wrap(this.store.match(subject, predicate, object, graph));
    return formStoreRes
      .filter(item => item.predicate.termType === 'NamedNode' && !item.predicate.value.startsWith(prefixCrdt));
  }

  public remove(stream: Stream<Q>): EventEmitter {
    // Should remove the item itself, remove the add labels, and make remove labels with the same subj and pred
    const toAdd: Q[] = [];
    const toRemove = wrap(stream)
      .transform<Q>({ transform: (item, done, push) => {
        // Remove item itself
        push(item);
        // ToAdd.push(item);
        done();
      } });

    const combined = new EventEmitter();
    const removeEmitter = this.store.remove(toRemove);
    removeEmitter.on('data', data => combined.emit('data', data));
    removeEmitter.on('error', error => combined.emit('error', error));
    removeEmitter.on('end', () => {
      const addEmitter = this.store.import(wrap(toAdd));
      addEmitter.on('data', data => combined.emit('data', data));
      addEmitter.on('error', error => combined.emit('error', error));
      addEmitter.on('end', () => combined.emit('end'));
    });

    return combined;
  }

  public removeMatches(
    subject?: Term | null,
    predicate?: Term | null,
    object?: Term | null,
    graph?: Term | null,
  ): EventEmitter {
    return this.remove(this.match(subject, predicate, object, graph));
  }

  /**
   * Core of a state base CRDT - must be communicative, associative and idempotent
   * https://youtu.be/OqqliwwG0SM?t=613&si=QGhZoSSPLYpvlObs
   * https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#OR-Set_(Observed-Remove_Set)
   * https://inria.hal.science/inria-00555588/document#?page=29
   */
  public async crdtMergeGraph(newStore: Store<Q>, other: CrdtStore<Q>, graph: Q['graph']): Promise<void> {
    const DF = this.DF;
    const origStore = this.store;
    const otherStore = other.store;

    // Key = termType + value
    // used for knowing what reified is used for what quad (triple term)
    // Mapping knownTagger (in newStore) to the one in store. (can only be one given correct merges)
    const termTranslation: Record<string, Term | undefined> = {};
    const mapTerm = (term: Term): Term => {
      const newTerm = termTranslation[termString(term)];
      return newTerm ?? term;
    };
    const translateQuad = (quad: Q): Q => {
      const newSubj = mapTerm(quad.subject);
      if (newSubj === quad.subject) {
        return quad;
      }
      return DF.quad(newSubj, quad.predicate, quad.object, quad.graph);
    };

    // Add others reifiers - they are already on the server (synced) so we give them precedence.
    await new Promise(resolve =>
      newStore.import(otherStore.match(null, this.DF.namedNode(CRDT.TAGGING), null, graph)).on('end', resolve));
    // Populate termTranslation for those reification subjects in `this` that tag the same triple (triple term equality)
    // And add those that were not present in `other`.
    const newTags = wrap(origStore.match(null, this.DF.namedNode(CRDT.TAGGING), null, graph))
      .transform<Q>({
        transform: (quad, done, push) => {
          const tripleTerm = quad.object;
          const currentTagger = quad.subject;
          const knownTaggerRes = newStore.match(null, null, tripleTerm, graph);
          wrap(knownTaggerRes).toArray().then((knownTaggerQuad) => {
            const knownTagger = knownTaggerQuad.at(0)?.subject;
            // Is there a known tag? If yes, remember in case the name is different
            if (knownTagger) {
              if (!knownTagger.equals(currentTagger)) {
                termTranslation[termString(currentTagger)] = knownTagger;
              }
            } else {
              // Not yet present, push...
              push(quad);
            }
            done();
          }).catch((err) => {
            throw err;
          });
        },
      });
    await new Promise(resolve => newStore.import(newTags).on('end', resolve));

    // NewStore knows all thing being Tagged. Now add `remove tags`
    const removeTaggers = wrap(newStore.match(null, DF.namedNode(CRDT.TAGGING), null, graph)).transform<Q>({
      transform: (quad, done, push) => {
        const tagger = quad.subject;
        const metaDataTriples = wrap(origStore.match(mapTerm(tagger), DF.namedNode(CRDT.DELETE), null, graph))
          .map(translateQuad)
          .append(wrap(otherStore.match(tagger, DF.namedNode(CRDT.DELETE), null, graph)));
        (async() => {
          for await (const quad of metaDataTriples) {
            push(quad);
          }
          done();
        })().catch((err) => {
          throw err;
        });
      },
    });
    await new Promise(resolve => newStore.import(removeTaggers).on('end', resolve));

    // Now add those add tags that are not removed.
    const addTaggers = wrap(newStore.match(null, DF.namedNode(CRDT.TAGGING), null, graph)).transform<Q>({
      transform: (quad, done, push) => {
        const tagger = quad.subject;
        const metaDataTriples = wrap(origStore.match(mapTerm(tagger), DF.namedNode(CRDT.ADD), null, graph))
          .map(translateQuad)
          .append(wrap(otherStore.match(tagger, DF.namedNode(CRDT.ADD), null, graph)));

        (async() => {
          for await (const quad of metaDataTriples) {
            if ((await wrap(newStore.match(quad.subject, DF.namedNode(CRDT.DELETE), quad.object, graph))
              .toArray()).length === 0) {
              push(quad);
            }
          }
          done();
        })().catch((err) => {
          throw err;
        });
      },
    });
    await new Promise(resolve => newStore.import(addTaggers).on('end', resolve));

    const activeTriple = wrap(newStore.match(null, DF.namedNode(CRDT.ADD), null, graph))
      .map(quad => quad.subject).uniq(tagger => termString(tagger))
      .transform<Q>({ transform: (tagger, done, push) => {
        const taggedRes = wrap(newStore.match(tagger, DF.namedNode(CRDT.TAGGING), null, graph));
        taggedRes.toArray().then((list) => {
          const quadToAdd = list.at(0)?.object;
          if (!quadToAdd || quadToAdd.termType !== 'Quad') {
            throw new Error(`Did not find tripleTerm of tagger ${termString(tagger)}`);
          }
          push(<Q> quadToAdd);
          done();
        }).catch((err) => {
          throw err;
        });
      } });
    await new Promise(resolve => newStore.import(activeTriple).on('end', resolve));
  }

  /**
   * Merge two add-wins set CRDTs.
   * Calls the merge function for each unique graph present.
   */
  public async crdtMerge(other: CrdtStore<Q>): Promise<void> {
    const newStore: Store<Q> = <any> RdfStore.createDefault();
    const store = this.store;
    const otherStore = other.store;
    const handledGraphs = new Set<string>();

    const allGraphs = wrap(store.match()).append(wrap(otherStore.match()))
      .map(quad => quad.graph);

    for await (const graph of allGraphs) {
      const graphName = graph.value;
      if (!handledGraphs.has(graphName)) {
        handledGraphs.add(graphName);
        await this.crdtMergeGraph(newStore, other, graph);
      }
    }

    this.store = newStore;
  }
}
