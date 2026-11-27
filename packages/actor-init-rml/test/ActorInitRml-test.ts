import { ActorInit } from '@comunica/bus-init';
import { KeysInitQuery, KeysQueryParseRml } from '@comunica/context-entries';
import { ActionContext, ActionContextKey, Bus } from '@comunica/core';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorInitRml, RmlEngineBase } from '../lib';
import '@comunica/utils-jest';

const DF = new DataFactory();
const quad = DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'));

describe('ActorInitRml', () => {
  let actor: ActorInitRml;
  let mediatorQueryParse: any;
  let mediatorQueryOperation: any;

  beforeEach(() => {
    mediatorQueryParse = { mediate: jest.fn(async() => ({ operation: 'operation' })) };
    mediatorQueryOperation = {
      mediate: jest.fn(async() => ({ type: 'quads', quadStream: new ArrayIterator([ quad ], { autoStart: false }) })),
    };
    const bus: any = new Bus({ name: 'bus' });
    actor = new ActorInitRml({ name: 'actor', bus, mediatorQueryParse, mediatorQueryOperation });
  });

  it('should be an ActorInit', () => {
    expect(actor).toBeInstanceOf(ActorInit);
  });

  it('should test', async() => {
    await expect(actor.test(<any> {})).resolves.toPassTestVoid();
  });

  it('should not run', async() => {
    await expect(actor.run(<any> {})).rejects
      .toThrow('ActorInitRml#run is not supported, use an RmlEngineBase instead.');
  });

  describe('RmlEngineBase', () => {
    let engine: RmlEngineBase;

    beforeEach(() => {
      engine = new RmlEngineBase(actor);
    });

    it('should materialize a mapping', async() => {
      const quads = await engine.materialize('mapping');
      await expect(quads.toArray()).resolves.toEqual([ quad ]);

      const { context, ...parseAction } = mediatorQueryParse.mediate.mock.calls[0][0];
      expect(parseAction).toEqual({
        query: 'mapping',
        queryFormat: { language: 'rml', version: '1.0' },
        baseIRI: undefined,
      });
      expect(context.get(KeysInitQuery.dataFactory)).toBeInstanceOf(DataFactory);
      expect(context.get(KeysInitQuery.queryTimestamp)).toBeInstanceOf(Date);
      expect(context.get(KeysInitQuery.functionArgumentsCache)).toEqual({});
      expect(context.has(KeysInitQuery.baseIRI)).toBe(false);
      expect(context.has(KeysQueryParseRml.mappingDirectory)).toBe(false);
      expect(mediatorQueryOperation.mediate).toHaveBeenCalledWith({ operation: 'operation', context });
    });

    it('should pass the options through the context', async() => {
      const key = new ActionContextKey<string>('key');
      await engine.materialize('mapping', {
        baseIRI: 'http://example.org/',
        mappingDirectory: 'file:///mappings/',
        context: new ActionContext().set(key, 'value').set(KeysInitQuery.dataFactory, DF),
      });

      const { context, baseIRI } = mediatorQueryParse.mediate.mock.calls[0][0];
      expect(baseIRI).toBe('http://example.org/');
      expect(context.get(KeysInitQuery.baseIRI)).toBe('http://example.org/');
      expect(context.get(KeysQueryParseRml.mappingDirectory)).toBe('file:///mappings/');
      expect(context.get(key)).toBe('value');
      expect(context.get(KeysInitQuery.dataFactory)).toBe(DF);
    });
  });
});
