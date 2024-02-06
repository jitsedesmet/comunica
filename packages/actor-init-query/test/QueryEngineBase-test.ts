import { Readable, Transform } from 'stream';
import { BindingsFactory } from '@comunica/bindings-factory';
import { KeysInitQuery } from '@comunica/context-entries';
import { Bus, ActionContext } from '@comunica/core';
import { MetadataValidationState } from '@comunica/metadata';
import type {
  IActionContext, QueryStringContext, IQueryBindingsEnhanced, IQueryQuadsEnhanced,
  QueryType, IQueryOperationResultQuads, IQueryOperationResultBindings,
  IQueryOperationResultBoolean, IQueryOperationResultVoid, IQueryEngine,
} from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import arrayifyStream from 'arrayify-stream';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { translate } from 'sparqlalgebrajs';
import { QueryEngineBase } from '../lib';
import { ActorInitQuery } from '../lib/ActorInitQuery';
import { ActorInitQueryBase } from '../lib/ActorInitQueryBase';
import '@comunica/jest';
import 'jest-rdf';

const DF = new DataFactory();
const BF = new BindingsFactory(DF, {});

describe('ActorInitQueryBase', () => {
  it('should not allow invoking its run method', () => {
    return expect(new (<any> ActorInitQueryBase)({ bus: new Bus({ name: 'bus' }) }).run()).rejects.toBeTruthy();
  });
});

// eslint-disable-next-line mocha/max-top-level-suites
describe('QueryEngineBase', () => {
  let bus: any;
  let mediatorQueryProcess: any;
  let mediatorSparqlSerialize: any;
  let mediatorHttpInvalidate: any;
  let actorInitQuery: ActorInitQuery;
  let context: IActionContext;
  let input: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    input = new Readable({ objectMode: true });
    input._read = () => {
      const triple = { a: 'triple' };
      input.push(triple);
      input.push(null);
    };
    mediatorQueryProcess = <any>{
      mediate: jest.fn((action: any) => {
        if (action.context.has(KeysInitQuery.explain)) {
          return Promise.resolve({
            result: {
              explain: 'true',
              data: 'EXPLAINED',
            },
          });
        }
        return action.query !== 'INVALID' ?
          Promise.resolve({
            result: { type: 'bindings', bindingsStream: input, metadata: () => ({}), context: action.context },
          }) :
          Promise.reject(new Error('Invalid query'));
      }),
    };
    mediatorSparqlSerialize = {
      mediate: (arg: any) => Promise.resolve(arg.mediaTypes ?
        { mediaTypes: arg } :
        {
          handle: {
            data: arg.handle.bindingsStream
              .pipe(new Transform({
                objectMode: true,
                transform: (e: any, enc: any, cb: any) => cb(null, JSON.stringify(e)),
              })),
          },
        }),
    };
    mediatorHttpInvalidate = {
      mediate: (arg: any) => Promise.resolve(true),
    };
    context = new ActionContext();
  });

  describe('The QueryEngineBase module', () => {
    it('should be a function', () => {
      expect(QueryEngineBase).toBeInstanceOf(Function);
    });

    it('should be a QueryEngineBase constructor', () => {
      expect(new QueryEngineBase(actorInitQuery)).toBeInstanceOf(QueryEngineBase);
      expect(new QueryEngineBase(actorInitQuery)).toBeInstanceOf(QueryEngineBase);
    });

    it('should not be able to create new QueryEngineBase objects without \'new\'', () => {
      expect(() => { (<any> QueryEngineBase)(); }).toThrow();
    });
  });

  describe('An QueryEngineBase instance', () => {
    const queryString = 'SELECT * WHERE { ?s ?p ?o } LIMIT 100';
    let actor: ActorInitQuery;
    let queryEngine: IQueryEngine;

    beforeEach(() => {
      const defaultQueryInputFormat = 'sparql';

      actor = new ActorInitQuery(
        { bus,
          defaultQueryInputFormat,
          mediatorHttpInvalidate,
          mediatorQueryProcess,
          mediatorQueryResultSerialize: mediatorSparqlSerialize,
          mediatorQueryResultSerializeMediaTypeCombiner: mediatorSparqlSerialize,
          mediatorQueryResultSerializeMediaTypeFormatCombiner: mediatorSparqlSerialize,
          name: 'actor' },
      );
      queryEngine = new QueryEngineBase(actor);
    });

    describe('invalidateHttpCache', () => {
      it('should call the HTTP invalidate mediator', async() => {
        jest.spyOn(mediatorHttpInvalidate, 'mediate');
        await queryEngine.invalidateHttpCache('a');
        expect(mediatorHttpInvalidate.mediate).toHaveBeenCalledWith({ context, url: 'a' });
      });
    });

    describe('query', () => {
      it('should apply bindings when initialBindings are passed via the context', () => {
        const ctx: QueryStringContext = {
          sources: [ 'dummy' ],
          '@comunica/actor-init-query:initialBindings': BF.bindings([
            [ DF.variable('s'), DF.literal('sl') ],
          ]),
        };
        return expect(queryEngine.query('SELECT * WHERE { ?s ?p ?o }', ctx))
          .resolves.toBeTruthy();
      });

      it('should apply bindings when initialBindings in the old format are passed via the context', () => {
        const ctx: QueryStringContext = {
          sources: [ 'dummy' ],
          initialBindings: BF.bindings([
            [ DF.variable('s'), DF.literal('sl') ],
          ]),
        };
        return expect(queryEngine.query('SELECT * WHERE { ?s ?p ?o }', ctx))
          .resolves.toBeTruthy();
      });

      it('should apply bindings when sources in the old format are passed via the context', () => {
        return expect(queryEngine.query('SELECT * WHERE { ?s ?p ?o }', { sources: [ 'abc' ]}))
          .resolves.toBeTruthy();
      });

      it('should allow query to be called without context', () => {
        return expect(queryEngine.query('SELECT * WHERE { ?s ?p ?o }'))
          .resolves.toBeTruthy();
      });

      it('should allow KeysInitSparql.queryTimestamp to be set', () => {
        const ctx: QueryStringContext = { sources: [ 'dummy' ], [KeysInitQuery.queryTimestamp.name]: new Date() };
        return expect(queryEngine.query('SELECT * WHERE { ?s ?p ?o }', ctx))
          .resolves.toBeTruthy();
      });

      it('should allow a parsed query to be passed', () => {
        return expect(queryEngine.query(translate('SELECT * WHERE { ?s ?p ?o }')))
          .resolves.toBeTruthy();
      });

      it('should not modify the baseIRI without BASE in query', async() => {
        expect((<any> (await queryEngine.query('SELECT * WHERE { ?s ?p ?o }')).context)
          .toJS()['@comunica/actor-init-query:baseIRI']).toBeFalsy();
      });

      it('should allow process actors to modify the context', async() => {
        mediatorQueryProcess.mediate = (action: any) => {
          return Promise.resolve({
            result: {
              type: 'bindings',
              bindingsStream: input,
              metadata: () => ({}),
              context: action.context.setRaw('the-answer', 42),
            },
          });
        };
        const result = await queryEngine.query('SELECT * WHERE { ?s ?p ?o }');
        expect(result).toHaveProperty('context');
        expect((<ActionContext> result.context).getRaw('the-answer')).toEqual(42);
      });

      it('should return a rejected promise on an invalid request', () => {
        const ctx: QueryStringContext = { sources: [ 'abc' ]};
        // Make it reject instead of reading input
        mediatorQueryProcess.mediate = (action: any) => Promise.reject(new Error('a'));
        return expect(queryEngine.query('INVALID QUERY', ctx)).rejects.toBeTruthy();
      });

      it('should return a rejected promise on an explain', () => {
        const ctx: QueryStringContext = { sources: [ 'abc' ], [KeysInitQuery.explain.name]: 'parsed' };
        return expect(queryEngine.query('BLA', ctx)).rejects
          .toThrowError('Tried to explain a query when in query-only mode');
      });
    });

    describe('SparqlQueryable methods', () => {
      describe('queryBindings', () => {
        it('handles a valid bindings query', async() => {
          input = new ArrayIterator([
            BF.bindings([
              [ DF.variable('a'), DF.namedNode('ex:a') ],
            ]),
          ]);
          await expect(await queryEngine.queryBindings('SELECT ...')).toEqualBindingsStream([
            BF.bindings([
              [ DF.variable('a'), DF.namedNode('ex:a') ],
            ]),
          ]);
        });

        it('rejects for an invalid bindings query', async() => {
          mediatorQueryProcess.mediate = jest.fn(() => Promise.resolve({ result: { type: 'void' }}));
          await expect(queryEngine.queryBindings('INSERT ...')).rejects
            .toThrowError(`Query result type 'bindings' was expected, while 'void' was found.`);
        });
      });

      describe('queryQuads', () => {
        it('handles a valid bindings query', async() => {
          input = new ArrayIterator([
            DF.quad(DF.namedNode('ex:a'), DF.namedNode('ex:a'), DF.namedNode('ex:a')),
          ]);
          mediatorQueryProcess.mediate = jest.fn(() => Promise
            .resolve({ result: { type: 'quads', quadStream: input }}));
          expect(await arrayifyStream(await queryEngine.queryQuads('CONSTRUCT ...'))).toEqualRdfQuadArray([
            DF.quad(DF.namedNode('ex:a'), DF.namedNode('ex:a'), DF.namedNode('ex:a')),
          ]);
        });

        it('rejects for an invalid bindings query', async() => {
          mediatorQueryProcess.mediate = jest.fn(() => Promise.resolve({ result: { type: 'void' }}));
          await expect(queryEngine.queryQuads('INSERT ...')).rejects
            .toThrowError(`Query result type 'quads' was expected, while 'void' was found.`);
        });
      });

      describe('queryBoolean', () => {
        it('handles a valid boolean query', async() => {
          mediatorQueryProcess.mediate = jest.fn(() => Promise.resolve({
            result: {
              type: 'boolean',
              execute: () => Promise.resolve(true),
            },
          }));
          expect(await queryEngine.queryBoolean('ASK ...')).toEqual(true);
        });

        it('rejects for an invalid boolean query', async() => {
          mediatorQueryProcess.mediate = jest.fn(() => Promise.resolve({ result: { type: 'void' }}));
          await expect(queryEngine.queryBoolean('INSERT ...')).rejects
            .toThrowError(`Query result type 'boolean' was expected, while 'void' was found.`);
        });
      });

      describe('queryVoid', () => {
        it('handles a valid void query', async() => {
          mediatorQueryProcess.mediate = jest.fn(() => Promise.resolve({
            result: {
              type: 'void',
              execute: () => Promise.resolve(true),
            },
          }));
          expect(await queryEngine.queryVoid('INSERT ...')).toEqual(true);
        });

        it('rejects for an invalid void query', async() => {
          mediatorQueryProcess.mediate = jest.fn(() => Promise.resolve({
            result: { type: 'boolean' },
          }));
          await expect(queryEngine.queryVoid('ASK ...')).rejects
            .toThrowError(`Query result type 'void' was expected, while 'boolean' was found.`);
        });
      });
    });

    describe('getResultMediaTypeFormats', () => {
      it('should return the media type formats', () => {
        const med: any = {
          mediate: (arg: any) => Promise.resolve({ mediaTypeFormats: { data: 'DATA' }}),
        };
        actor = new ActorInitQuery(
          { bus,
            mediatorHttpInvalidate,
            mediatorQueryProcess,
            mediatorQueryResultSerialize: med,
            mediatorQueryResultSerializeMediaTypeCombiner: med,
            mediatorQueryResultSerializeMediaTypeFormatCombiner: med,
            name: 'actor',
            queryString },
        );
        queryEngine = new QueryEngineBase(actor);
        return expect(queryEngine.getResultMediaTypeFormats())
          .resolves.toEqual({ data: 'DATA' });
      });
    });
  });

  describe('An QueryEngineBase instance for quads', () => {
    let actor: ActorInitQuery;
    let queryEngine: QueryEngineBase;

    beforeEach(() => {
      mediatorQueryProcess.mediate = (action: any) => action.operation.query !== 'INVALID' ?
        Promise.resolve({ quadStream: input, type: 'quads' }) :
        Promise.reject(new Error('a'));
      const defaultQueryInputFormat = 'sparql';
      actor = new ActorInitQuery(
        { bus,
          defaultQueryInputFormat,
          mediatorHttpInvalidate,
          mediatorQueryProcess,
          mediatorQueryResultSerialize: mediatorSparqlSerialize,
          mediatorQueryResultSerializeMediaTypeCombiner: mediatorSparqlSerialize,
          mediatorQueryResultSerializeMediaTypeFormatCombiner: mediatorSparqlSerialize,
          name: 'actor' },
      );
      queryEngine = new QueryEngineBase(actor);
    });

    it('should return a rejected promise on an invalid request', () => {
      // Make it reject instead of reading input
      mediatorQueryProcess.mediate = (action: any) => Promise.reject(new Error('a'));
      return expect(queryEngine.query('INVALID QUERY', { sources: [ 'abc' ]})).rejects.toBeTruthy();
    });
  });

  describe('internalToFinalResult', () => {
    it('converts bindings', async() => {
      const final = <QueryType & IQueryBindingsEnhanced> QueryEngineBase.internalToFinalResult({
        type: 'bindings',
        bindingsStream: new ArrayIterator([
          BF.bindings([
            [ DF.variable('a'), DF.namedNode('ex:a') ],
          ]),
        ]),
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { type: 'estimate', value: 1 },
          canContainUndefs: false,
          variables: [ DF.variable('a') ],
        }),
        context: new ActionContext({ c: 'd' }),
      });

      expect(final.resultType).toEqual('bindings');
      await expect(await final.execute()).toEqualBindingsStream([
        BF.bindings([
          [ DF.variable('a'), DF.namedNode('ex:a') ],
        ]),
      ]);
      expect(await final.metadata()).toEqual({
        state: expect.any(MetadataValidationState),
        cardinality: { type: 'estimate', value: 1 },
        canContainUndefs: false,
        variables: [ DF.variable('a') ],
      });
      expect(final.context).toEqual(new ActionContext({ c: 'd' }));
    });

    it('converts quads', async() => {
      const final = <QueryType & IQueryQuadsEnhanced> QueryEngineBase.internalToFinalResult({
        type: 'quads',
        quadStream: new ArrayIterator([
          DF.quad(DF.namedNode('ex:a'), DF.namedNode('ex:a'), DF.namedNode('ex:a')),
        ]),
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { type: 'estimate', value: 1 },
          canContainUndefs: false,
          variables: [ DF.variable('a') ],
        }),
        context: new ActionContext({ c: 'd' }),
      });

      expect(final.resultType).toEqual('quads');
      expect(await arrayifyStream(await final.execute())).toEqualRdfQuadArray([
        DF.quad(DF.namedNode('ex:a'), DF.namedNode('ex:a'), DF.namedNode('ex:a')),
      ]);
      expect(await final.metadata()).toEqual({
        state: expect.any(MetadataValidationState),
        cardinality: { type: 'estimate', value: 1 },
        canContainUndefs: false,
        variables: [ DF.variable('a') ],
      });
      expect(final.context).toEqual(new ActionContext({ c: 'd' }));
    });

    it('converts booleans', async() => {
      const final = <QueryType & RDF.QueryBoolean> QueryEngineBase.internalToFinalResult({
        type: 'boolean',
        execute: () => Promise.resolve(true),
        context: new ActionContext({ c: 'd' }),
      });

      expect(final.resultType).toEqual('boolean');
      expect(await final.execute()).toEqual(true);
      expect(final.context).toEqual(new ActionContext({ c: 'd' }));
    });

    it('converts voids', async() => {
      const final = <QueryType & RDF.QueryVoid> QueryEngineBase.internalToFinalResult({
        type: 'void',
        execute: () => Promise.resolve(),
        context: new ActionContext({ c: 'd' }),
      });

      expect(final.resultType).toEqual('void');
      expect(await final.execute()).toBeUndefined();
      expect(final.context).toEqual(new ActionContext({ c: 'd' }));
    });
  });

  describe('finalToInternalResult', () => {
    it('converts bindings', async() => {
      const internal = <IQueryOperationResultBindings> await QueryEngineBase.finalToInternalResult({
        resultType: 'bindings',
        execute: async() => new ArrayIterator([
          BF.bindings([
            [ DF.variable('a'), DF.namedNode('ex:a') ],
          ]),
        ]),
        metadata: async() => (<any>{
          cardinality: { type: 'estimate', value: 1 },
          canContainUndefs: false,
          variables: [ DF.variable('a') ],
        }),
      });

      expect(internal.type).toEqual('bindings');
      await expect(internal.bindingsStream).toEqualBindingsStream([
        BF.bindings([
          [ DF.variable('a'), DF.namedNode('ex:a') ],
        ]),
      ]);
      expect(await internal.metadata()).toEqual({
        cardinality: { type: 'estimate', value: 1 },
        canContainUndefs: false,
        variables: [ DF.variable('a') ],
      });
    });

    it('converts quads', async() => {
      const internal = <IQueryOperationResultQuads> await QueryEngineBase.finalToInternalResult({
        resultType: 'quads',
        execute: async() => new ArrayIterator([
          DF.quad(DF.namedNode('ex:a'), DF.namedNode('ex:a'), DF.namedNode('ex:a')),
        ]),
        metadata: async() => (<any>{ cardinality: 1, canContainUndefs: false }),
      });

      expect(internal.type).toEqual('quads');
      expect(await arrayifyStream(internal.quadStream)).toEqualRdfQuadArray([
        DF.quad(DF.namedNode('ex:a'), DF.namedNode('ex:a'), DF.namedNode('ex:a')),
      ]);
      expect(await internal.metadata()).toEqual({
        cardinality: 1,
        canContainUndefs: false,
      });
    });

    it('converts booleans', async() => {
      const final = <IQueryOperationResultBoolean> await QueryEngineBase.finalToInternalResult({
        resultType: 'boolean',
        execute: async() => true,
      });

      expect(final.type).toEqual('boolean');
      expect(await final.execute()).toEqual(true);
    });

    it('converts voids', async() => {
      const final = <IQueryOperationResultVoid> await QueryEngineBase.finalToInternalResult({
        resultType: 'void',
        // eslint-disable-next-line unicorn/no-useless-undefined
        execute: async() => undefined,
      });

      expect(final.type).toEqual('void');
      expect(await final.execute()).toBeUndefined();
    });
  });
});
