/* eslint-disable import/no-nodejs-modules */
import { EventEmitter } from 'node:events';
import type { BaseQuad, Quad, Store, Stream, Term } from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { wrap } from 'asynciterator';
import { RdfStore } from 'rdf-stores';
import type { DataFactoryUuid } from './DataFactoryUuid';

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
  return `${term.termType}${term.value}`;
}

function attachEvent(from: EventEmitter, to: EventEmitter): void {
  from.on('data', data => to.emit('data', data));
  from.on('error', error => to.emit('error', error));
  from.on('end', () => to.emit('end'));
}

/**
 * Implementation of a state-based Set CRDT (SU-set).
 * Has an internal store that reflects the remote data,
 * but wraps around that store to be a front for what is exported outside.
 * Depends on https://github.com/rubensworks/rdf-dereference.js/
 */
export class CrdtStore<Q extends BaseQuad = Quad> implements Store<Q> {
  /**
   * List used to sequentialize all operations on the store.
   */
  public actionableList: EventEmitter[] = [];
  public constructor(private store: Store<Q>, private readonly DF: DataFactoryUuid<Q>) {}

  private sequentializeEvent(callback: () => EventEmitter): EventEmitter {
    const lastEvent = this.actionableList.at(-1);
    const wrappedEvent = new EventEmitter();
    this.actionableList.push(wrappedEvent);
    wrappedEvent.on('end', () => this.actionableList.shift());

    if (lastEvent) {
      lastEvent.on('end', () => {
        const event = callback();
        attachEvent(event, wrappedEvent);
      });
    } else {
      const event = callback();
      attachEvent(event, wrappedEvent);
    }
    return wrappedEvent;
  }

  public deleteGraph(graph: Quad['graph'] | string): EventEmitter {
    return this.removeMatches(null, null, null, typeof graph === 'string' ? this.DF.namedNode(graph) : graph);
  }

  /**
   * Here you have the choice whether adding what was already added should still create a new Tag or not.
   * We do not perform sush a filter here.
   * @param stream
   */
  public import(stream: Stream<Q>): EventEmitter {
    return this.sequentializeEvent(() => {
      const DF = this.DF;
      const store = this.store;
      // Import stream and verify tagging
      const insertStream = wrap(stream).transform<Q>({ transform: (quad, done, push) => {
        push(quad);
        // First check whether we already have a reifier for this triple.
        const tripleTerm = DF.quad(quad.subject, quad.predicate, quad.object);
        const graph = quad.graph;
        wrap(store.match(null, DF.namedNode(CRDT.TAGGING), tripleTerm, graph)).toArray().then((reifierRes) => {
          let reifier = reifierRes.at(0)?.subject;
          if (!reifier) {
            reifier = DF.blankNode();
            push(DF.quad(reifier, DF.namedNode(CRDT.TAGGING), tripleTerm, graph));
          }
          push(DF.quad(
            reifier,
            DF.namedNode(CRDT.ADD),
            DF.literal(crypto.randomUUID(), DF.namedNode(CRDT.DT_UUID)),
            graph,
          ));
          done();
        }).catch((error) => {
          throw error;
        });
      } });
      return this.store.import(insertStream);
    });
  }

  public match(
    subject?: Term | null,
    predicate?: Term | null,
    object?: Term | null,
    graph?: Term | null,
  ): Stream<Q> & AsyncIterator<Q> {
    // No need to sequentialize since the store is read once, changes to it do not matter.
    // Just get the triples that are not dedicated to your management structure.
    const formStoreRes = wrap(this.store.match(subject, predicate, object, graph));
    return formStoreRes
      .filter(item => item.predicate.termType === 'NamedNode' && !item.predicate.value.startsWith(prefixCrdt));
  }

  public remove(stream: Stream<Q>): EventEmitter {
    return this.sequentializeEvent(() => {
      const DF = this.DF;
      const store = this.store;
      // Should remove the item itself, remove the add labels, and make remove labels with the same subj and pred
      const dataStream = wrap(stream).clone();
      const metaDataTriples = dataStream.clone()
        .transform<Q>({
          transform: (quad, done, push) => {
          // Remove item itself
            const graph = quad.graph;
            const tripleTerm = DF.quad(quad.subject, quad.predicate, quad.object);
            // Perform lookup of add labels:
            (async() => {
              const reifierRes = await wrap(store.match(null, null, tripleTerm, graph)).toArray();
              const reifier = reifierRes.at(0)?.subject;
              // Reifier should exist since all triples are tracked. Can now look for add labels
              if (reifier) {
                const metaDataStream = store.match(reifier, DF.namedNode(CRDT.ADD), null, graph);
                metaDataStream.on('data', (data: Q) => {
                  push(data);
                  push(DF.quad(reifier, DF.namedNode(CRDT.DELETE), data.object, graph));
                });
                metaDataStream.on('end', () => done());
              } else {
                done();
              }
            })().catch((err) => {
              throw err;
            });
          },
        });

      const combined = new EventEmitter();
      let ended = 0;
      function end(): void {
        ended++;
        if (ended > 1) {
          combined.emit('end');
        }
      }
      const metadataToRemove = metaDataTriples.clone().filter(data => data.predicate.value === CRDT.ADD);
      const metadataToAdd = metaDataTriples.clone().filter(data => data.predicate.value === CRDT.DELETE);
      const removeEmitter = this.store.remove(dataStream.clone().append(metadataToRemove));
      const addEmitter = this.store.import(metadataToAdd);
      removeEmitter.on('data', data => combined.emit('data', data));
      removeEmitter.on('error', error => combined.emit('error', error));
      removeEmitter.on('end', end);
      addEmitter.on('data', data => combined.emit('data', data));
      addEmitter.on('error', error => combined.emit('error', error));
      addEmitter.on('end', end);

      return combined;
    });
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
    // Mapping knownTagger (in newStore) to the one in origStore. (can only be one given correct merges)
    const toOrigReifier: Record<string, Term | undefined> = {};
    const toNewReifier: Record<string, Term | undefined> = {};
    const translateOldQuadToNew = (quad: Q): Q => {
      const newSubj = toNewReifier[termString(quad.subject)];
      if (newSubj) {
        return DF.quad(newSubj, quad.predicate, quad.object, quad.graph);
      }
      return quad;
    };

    // Add others reifiers - they are already on the server (synced) so we give them precedence.
    await new Promise((resolve, reject) =>
      newStore.import(otherStore.match(null, this.DF.namedNode(CRDT.TAGGING), null, graph))
        .on('end', resolve).on('error', reject));
    // Populate toOrigReifier for those reification subjects in `this` that tag the same triple (triple term equality)
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
                toOrigReifier[termString(knownTagger)] = currentTagger;
                toNewReifier[termString(currentTagger)] = knownTagger;
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
    await new Promise((resolve, reject) => newStore.import(newTags)
      .on('end', resolve).on('error', reject));

    // NewStore knows all thing being Tagged. Now add `remove tags`
    const removeTaggers = wrap(newStore.match(null, DF.namedNode(CRDT.TAGGING), null, graph)).transform<Q>({
      transform: (quad, done, push) => {
        const tagger = quad.subject;
        const metaDataTriples =
          wrap(origStore.match(toOrigReifier[termString(tagger)] ?? tagger, DF.namedNode(CRDT.DELETE), null, graph))
            .map(translateOldQuadToNew)
            .append(wrap(otherStore.match(tagger, DF.namedNode(CRDT.DELETE), null, graph)));

        metaDataTriples.on('data', (data: Q) => push(data));
        metaDataTriples.on('end', () => done());
        metaDataTriples.on('error', (error) => {
          throw error;
        });
      },
    });
    await new Promise(resolve => newStore.import(removeTaggers).on('end', resolve));

    // Now add those add tags that are not removed.
    const addTaggers = wrap(newStore.match(null, DF.namedNode(CRDT.TAGGING), null, graph)).transform<Q>({
      transform: (quad, done, push) => {
        const tagger = quad.subject;
        const metaDataTriples =
          wrap(origStore.match(toOrigReifier[termString(tagger)] ?? tagger, DF.namedNode(CRDT.ADD), null, graph))
            .map(translateOldQuadToNew)
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
      .transform<Q>({
        transform: (tagger, done, push) => {
          const taggedRes = wrap(newStore.match(tagger, DF.namedNode(CRDT.TAGGING), null, graph));
          taggedRes.toArray().then((list) => {
            const quadToAdd = list.at(0)?.object;
            if (!quadToAdd || quadToAdd.termType !== 'Quad') {
              throw new Error(`Did not find tripleTerm of tagger ${termString(tagger)}`);
            }
            push(<Q>quadToAdd);
            done();
          }).catch((err) => {
            throw err;
          });
        },
      });
    await new Promise(resolve => newStore.import(activeTriple).on('end', resolve));
  }

  /**
   * Merge two add-wins set CRDTs.
   * Calls the merge function for each unique graph present.
   */
  public crdtMerge(other: CrdtStore<Q>): EventEmitter {
    return this.sequentializeEvent(() => {
      const newStore = <Store<Q>>RdfStore.createDefault();

      return wrap(this.store.match()).append(wrap(other.store.match()))
        .map(quad => quad.graph).uniq(graph => graph.value)
        .transform({ transform: (graph, done) => {
          this.crdtMergeGraph(newStore, other, graph).then(done).catch((error) => {
            throw error;
          });
        } })
        .on('end', () => this.store = newStore);
    });
  }
}
