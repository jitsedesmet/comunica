/** @jest-environment setup-polly-jest/jest-environment-node */

// Needed to undo automock from actor-http-native, cleaner workarounds do not appear to be working.
import { literal } from '@rdfjs/data-model';

jest.unmock('follow-redirects');

import { Store } from 'n3';
import { DataFactory } from 'rdf-data-factory';
import type * as RDF from 'rdf-js';
import type { ActorInitSparql, IQueryResultUpdate } from '../../index-browser';
import { newEngine } from '../../index-browser';
import type { IQueryResultBindings } from '../../lib/ActorInitSparql-browser';
import { mockHttp } from './util';
import 'jest-rdf';
import { KeysInitSparql } from '@comunica/context-entries';
const arrayifyStream = require('arrayify-stream');

const DF = new DataFactory();

describe('System test: ActorInitSparql', () => {
  const pollyContext = mockHttp();

  let engine: ActorInitSparql;

  beforeEach(() => {
    engine = newEngine();
    pollyContext.polly.server.any().on('beforePersist', (req, recording) => {
      recording.request.headers = recording.request.headers.filter(({ name }: any) => name !== 'user-agent');
    });
  });

  afterEach(async() => {
    await pollyContext.polly.flush();
  });

  describe('query', () => {
    describe('simple SPO on a raw RDF document', () => {
      it('with results', async() => {
        const result = <IQueryResultBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?o.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        expect((await arrayifyStream(result.bindingsStream)).length).toBeGreaterThan(100);
      });

      it('without results', async() => {
        const result = <IQueryResultBindings> await engine.query(`SELECT * WHERE {
      ?s <ex:dummy> ?o.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        expect((await arrayifyStream(result.bindingsStream))).toEqual([]);
      });

      it('for the single source context entry', async() => {
        const result = <IQueryResultBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?o.
    }`, { source: 'https://www.rubensworks.net/' });
        expect((await arrayifyStream(result.bindingsStream)).length).toBeGreaterThan(100);
      });

      it('repeated with the same engine', async() => {
        const query = `SELECT * WHERE {
      ?s ?p ?o.
    }`;
        const context = { sources: [ 'https://www.rubensworks.net/' ]};
        expect((await arrayifyStream((<IQueryResultBindings> await engine.query(query, context)).bindingsStream))
          .length).toBeGreaterThan(100);
        expect((await arrayifyStream((<IQueryResultBindings> await engine.query(query, context)).bindingsStream))
          .length).toBeGreaterThan(100);
        expect((await arrayifyStream((<IQueryResultBindings> await engine.query(query, context)).bindingsStream))
          .length).toBeGreaterThan(100);
        expect((await arrayifyStream((<IQueryResultBindings> await engine.query(query, context)).bindingsStream))
          .length).toBeGreaterThan(100);
        expect((await arrayifyStream((<IQueryResultBindings> await engine.query(query, context)).bindingsStream))
          .length).toBeGreaterThan(100);
      });

      it('repeated with the same engine without results', async() => {
        const query = `SELECT * WHERE {
      ?s <ex:dummy> ?o.
    }`;
        const context = { sources: [ 'https://www.rubensworks.net/' ]};
        expect((await arrayifyStream((<IQueryResultBindings> await engine.query(query, context)).bindingsStream)))
          .toEqual([]);
        expect((await arrayifyStream((<IQueryResultBindings> await engine.query(query, context)).bindingsStream)))
          .toEqual([]);
        expect((await arrayifyStream((<IQueryResultBindings> await engine.query(query, context)).bindingsStream)))
          .toEqual([]);
        expect((await arrayifyStream((<IQueryResultBindings> await engine.query(query, context)).bindingsStream)))
          .toEqual([]);
        expect((await arrayifyStream((<IQueryResultBindings> await engine.query(query, context)).bindingsStream)))
          .toEqual([]);
      });

      describe('custom function', () => {
        const funcAllow = 'allowAll';
        const baseFunctionName = (funcName: string) =>
          `http://example.org/functions#${funcName}`;
        const baseQuery = (funcName: string) => `PREFIX func: <http://example.org/functions#>
        SELECT * WHERE {
              ?s ?p ?o.
            FILTER (func:${funcName}(?o))
        }`;
        const baseFunctionMap = new Map<string, (args: RDF.Term[]) => Promise<RDF.Term>>([
          [ baseFunctionName(funcAllow), async(arg: RDF.Term[]) => {
            return literal('true', 'http://www.w3.org/2001/XMLSchema#boolean');
          } ],
        ]);
        const baseFunctionCreator = (functionName: RDF.NamedNode) => {
          return (arg: RDF.Term[]) => {
            return literal('true', 'http://www.w3.org/2001/XMLSchema#boolean');
          };
        };

        it('rejects when map does not match', async() => {
          const context = <any> { sources: [ 'https://www.rubensworks.net/' ]};
          context[KeysInitSparql.extensionFunctionMap] = baseFunctionMap;
          expect(engine.query(baseQuery('nonExist'), context)).rejects.toThrow();
        });

        it('rejects when creator returns null', async() => {
          const context = <any> { sources: [ 'https://www.rubensworks.net/' ]};
          context[KeysInitSparql.extensionFunctionCreator] = () => null;
          expect(engine.query(baseQuery('nonExist'), context)).rejects.toThrow();
        });

        it('with results and pointless custom filter given by creator', async() => {
          const context = <any> { sources: [ 'https://www.rubensworks.net/' ]};
          context[KeysInitSparql.extensionFunctionCreator] = baseFunctionCreator;
          const result = <IQueryResultBindings> await engine.query(baseQuery(funcAllow), context);
          expect((await arrayifyStream(result.bindingsStream)).length).toBeGreaterThan(100);
        });

        it('with results and pointless custom filter given by map', async() => {
          const context = <any> { sources: [ 'https://www.rubensworks.net/' ]};
          context[KeysInitSparql.extensionFunctionMap] = baseFunctionMap;
          const result = <IQueryResultBindings> await engine.query(baseQuery(funcAllow), context);
          expect((await arrayifyStream(result.bindingsStream)).length).toBeGreaterThan(100);
        });

        it('with results but all filtered away', async() => {
          const context = <any> { sources: [ 'https://www.rubensworks.net/' ]};
          context[KeysInitSparql.extensionFunctionCreator] = () => () =>
            literal('false', 'http://www.w3.org/2001/XMLSchema#boolean');
          const result = <IQueryResultBindings> await engine.query(baseQuery('rejectAll'), context);
          expect(await arrayifyStream(result.bindingsStream)).toEqual([]);
        });

        it('thorws error when supplying both map and creator', async() => {
          const context = <any> { sources: [ 'https://www.rubensworks.net/' ]};
          context[KeysInitSparql.extensionFunctionMap] = baseFunctionMap;
          context[KeysInitSparql.extensionFunctionCreator] = baseFunctionCreator;
          expect(engine.query(baseQuery(funcAllow), context)).rejects.toThrow('It is not allowed to provide both ' +
            'an extensionFunctionCreator an a extensionFunctionMap as this would lead to confusion');
        });
      });
    });

    describe('two-pattern query on a raw RDF document', () => {
      it('with results', async() => {
        const result = <IQueryResultBindings> await engine.query(`SELECT ?name WHERE {
  <https://www.rubensworks.net/#me> <http://xmlns.com/foaf/0.1/knows> ?v0.
  ?v0 <http://xmlns.com/foaf/0.1/name> ?name.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        expect((await arrayifyStream(result.bindingsStream)).length).toBeGreaterThan(20);
      });

      it('without results', async() => {
        const result = <IQueryResultBindings> await engine.query(`SELECT ?name WHERE {
  <https://www.rubensworks.net/#me> <http://xmlns.com/foaf/0.1/knows> ?v0.
  ?v0 <ex:dummy> ?name.
    }`, { sources: [ 'https://www.rubensworks.net/' ]});
        expect((await arrayifyStream(result.bindingsStream))).toEqual([]);
      });

      it('for the single source entry', async() => {
        const result = <IQueryResultBindings> await engine.query(`SELECT ?name WHERE {
  <https://www.rubensworks.net/#me> <http://xmlns.com/foaf/0.1/knows> ?v0.
  ?v0 <http://xmlns.com/foaf/0.1/name> ?name.
    }`, { source: 'https://www.rubensworks.net/' });
        expect((await arrayifyStream(result.bindingsStream)).length).toBeGreaterThan(20);
      });
    });

    describe('simple SPO on a TPF entrypoint', () => {
      it('with results', async() => {
        const result = <IQueryResultBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?o.
    } LIMIT 300`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        expect((await arrayifyStream(result.bindingsStream)).length).toEqual(300);
      });

      it('with filtered results', async() => {
        const result = <IQueryResultBindings> await engine.query(`SELECT * WHERE {
      ?s a ?o.
    } LIMIT 300`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        expect((await arrayifyStream(result.bindingsStream)).length).toEqual(300);
      });
    });

    describe('two-pattern query on a TPF entrypoint', () => {
      it('with results', async() => {
        const result = <IQueryResultBindings> await engine.query(`SELECT * WHERE {
      ?city a <http://dbpedia.org/ontology/Airport>;
            <http://dbpedia.org/property/cityServed> <http://dbpedia.org/resource/Italy>.
    }`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        expect((await arrayifyStream(result.bindingsStream)).length).toEqual(19);
      });

      it('without results', async() => {
        const result = <IQueryResultBindings> await engine.query(`SELECT * WHERE {
      ?city a <http://dbpedia.org/ontology/Airport>;
            <http://dbpedia.org/property/cityServed> <http://dbpedia.org/resource/UNKNOWN>.
    }`, { sources: [ 'https://fragments.dbpedia.org/2016-04/en' ]});
        expect((await arrayifyStream(result.bindingsStream))).toEqual([]);
      });
    });
  });

  describe('update', () => {
    describe('without sources on destination RDFJS Store', () => {
      it('with direct insert', async() => {
        // Prepare store
        const store = new Store();

        // Execute query
        const result = <IQueryResultUpdate> await engine.query(`INSERT DATA {
      <ex:s> <ex:p> <ex:o>.
    }`, {
          sources: [],
          destination: store,
        });
        await result.updateResult;

        // Check store contents
        expect(store.size).toEqual(1);
        expect(store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toEqual(1);
      });

      it('with direct insert on a single source', async() => {
        // Prepare store
        const store = new Store();

        // Execute query
        const result = <IQueryResultUpdate> await engine.query(`INSERT DATA {
      <ex:s> <ex:p> <ex:o>.
    }`, {
          sources: [ store ],
        });
        await result.updateResult;

        // Check store contents
        expect(store.size).toEqual(1);
        expect(store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toEqual(1);
      });

      it('with direct insert and delete', async() => {
        // Prepare store
        const store = new Store();
        store.addQuad(DF.quad(DF.namedNode('ex:s-pre'), DF.namedNode('ex:p-pre'), DF.namedNode('ex:o-pre')));

        // Execute query
        const result = <IQueryResultUpdate> await engine.query(`INSERT DATA {
      <ex:s> <ex:p> <ex:o>.
    };
    DELETE DATA {
      <ex:s-pre> <ex:p-pre> <ex:o-pre>.
    }`, {
          sources: [],
          destination: store,
        });
        await result.updateResult;

        // Check store contents
        expect(store.size).toEqual(1);
        expect(store.countQuads(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'), DF.defaultGraph()))
          .toEqual(1);
        expect(store
          .countQuads(DF.namedNode('ex:s-pre'), DF.namedNode('ex:p-pre'), DF.namedNode('ex:o-pre'), DF.defaultGraph()))
          .toEqual(0);
      });

      it('with variable delete', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p3'), DF.namedNode('ex:o3')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4')),
        ]);
        expect(store.size).toEqual(4);

        // Execute query
        const result = <IQueryResultUpdate> await engine.query(`DELETE WHERE {
      <ex:s> ?p ?o.
    }`, {
          sources: [ store ],
          destination: store,
        });
        await result.updateResult;

        // Check store contents
        expect(store.size).toEqual(1);
        expect(store.countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()))
          .toEqual(1);
      });

      it('with load', async() => {
        // Prepare store
        const store = new Store();

        // Execute query
        const result = <IQueryResultUpdate> await engine.query(
          `LOAD <https://www.rubensworks.net/> INTO GRAPH <ex:graph>`,
          {
            sources: [],
            destination: store,
          },
        );
        await result.updateResult;

        // Check store contents
        expect(store.size > 0).toBeTruthy();
      });

      it('with clear', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g2')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p3'), DF.namedNode('ex:o3'), DF.namedNode('ex:g3')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()),
        ]);
        expect(store.size).toEqual(4);

        // Execute query
        const result = <IQueryResultUpdate> await engine.query(`CLEAR NAMED`, {
          sources: [ store ],
          destination: store,
        });
        await result.updateResult;

        // Check store contents
        expect(store.size).toEqual(1);
        expect(store.countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()))
          .toEqual(1);
      });

      it('with drop', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g2')),
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p3'), DF.namedNode('ex:o3'), DF.namedNode('ex:g3')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()),
        ]);
        expect(store.size).toEqual(4);

        // Execute query
        const result = <IQueryResultUpdate> await engine.query(`DROP DEFAULT`, {
          sources: [ store ],
          destination: store,
        });
        await result.updateResult;

        // Check store contents
        expect(store.size).toEqual(3);
        expect(store.countQuads(DF.namedNode('ex:s4'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()))
          .toEqual(0);
      });

      it('with create', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p4'), DF.namedNode('ex:o4'), DF.defaultGraph()),
        ]);
        expect(store.size).toEqual(2);

        // Resolve for non-existing graph
        await expect((<IQueryResultUpdate> await engine.query(`CREATE GRAPH <ex:g2>`, {
          sources: [ store ],
          destination: store,
        })).updateResult).resolves.toBeUndefined();

        // Reject for existing graph
        await expect((<IQueryResultUpdate> await engine.query(`CREATE GRAPH <ex:g1>`, {
          sources: [ store ],
          destination: store,
        })).updateResult).rejects.toThrowError('Unable to create graph ex:g1 as it already exists');

        // Resolve for existing graph in silent mode
        await expect((<IQueryResultUpdate> await engine.query(`CREATE SILENT GRAPH <ex:g1>`, {
          sources: [ store ],
          destination: store,
        })).updateResult).resolves.toBeUndefined();
      });

      it('with add', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.defaultGraph()),
        ]);
        expect(store.size).toEqual(2);

        // Execute query
        const result = <IQueryResultUpdate> await engine.query(`ADD DEFAULT TO <ex:g1>`, {
          sources: [ store ],
          destination: store,
        });
        await result.updateResult;

        // Check store contents
        expect(store.size).toEqual(3);
        expect(store
          .countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g1')))
          .toEqual(1);
      });

      it('with move', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.defaultGraph()),
        ]);
        expect(store.size).toEqual(2);

        // Execute query
        const result = <IQueryResultUpdate> await engine.query(`MOVE DEFAULT TO <ex:g1>`, {
          sources: [ store ],
          destination: store,
        });
        await result.updateResult;

        // Check store contents
        expect(store.size).toEqual(1);
        expect(store
          .countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g1')))
          .toEqual(1);
      });

      it('with copy', async() => {
        // Prepare store
        const store = new Store();
        store.addQuads([
          DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p1'), DF.namedNode('ex:o1'), DF.namedNode('ex:g1')),
          DF.quad(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.defaultGraph()),
        ]);
        expect(store.size).toEqual(2);

        // Execute query
        const result = <IQueryResultUpdate> await engine.query(`COPY DEFAULT TO <ex:g1>`, {
          sources: [ store ],
          destination: store,
        });
        await result.updateResult;

        // Check store contents
        expect(store.size).toEqual(2);
        expect(store
          .countQuads(DF.namedNode('ex:s2'), DF.namedNode('ex:p2'), DF.namedNode('ex:o2'), DF.namedNode('ex:g1')))
          .toEqual(1);
      });
    });
  });
});
