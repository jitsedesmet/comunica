import type { IActionDereference, MediatorDereference } from '@comunica/bus-dereference';
import type { IActionQuerySourceIdentify, MediatorQuerySourceIdentify } from '@comunica/bus-query-source-identify';
import type { IActionRdfParseHandle, MediatorRdfParseHandle } from '@comunica/bus-rdf-parse';
import { ActionContext, Bus } from '@comunica/core';
import { stringify as streamToString } from '@jeswr/stream-to-string';
import { DataFactory } from 'rdf-data-factory';
import { Readable } from 'readable-stream';
import { streamifyArray } from 'streamify-array';
import { ActorQuerySourceIdentifyRml } from '../lib/ActorQuerySourceIdentifyRml';
import type { IRmlMapper } from '../lib/IRmlMapper';
import { RmlMapperComake } from '../lib/RmlMapperComake';
import '@comunica/utils-jest';

const DF = new DataFactory();
const RML_SOURCE = DF.namedNode('http://semweb.mmlab.be/ns/rml#source');

describe('ActorQuerySourceIdentifyRml', () => {
  let bus: any;
  let documents: Record<string, string>;
  let mediatorDereference: MediatorDereference;
  let mediatorRdfParse: MediatorRdfParseHandle;
  let mediatorQuerySourceIdentify: MediatorQuerySourceIdentify;
  let rmlMapper: IRmlMapper;
  let actor: ActorQuerySourceIdentifyRml;
  const context = new ActionContext();
  const sourceContext = new ActionContext({ a: 'b' });

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    documents = {
      'http://example.org/dir/mapping.ttl': 'MAPPING',
      'http://example.org/dir/people.json': 'PEOPLE',
      'http://other.example.org/pets.csv': 'PETS',
    };
    mediatorDereference = <any> {
      mediate: jest.fn(async({ url }: IActionDereference) => {
        if (!(url in documents)) {
          throw new Error(`Not found: ${url}`);
        }
        return { url, data: Readable.from([ documents[url] ]) };
      }),
    };
    mediatorRdfParse = <any> {
      mediate: jest.fn(async(_action: IActionRdfParseHandle) => ({
        handle: {
          data: streamifyArray([
            DF.quad(DF.blankNode('ls1'), RML_SOURCE, DF.literal('people.json')),
            DF.quad(DF.blankNode('ls2'), RML_SOURCE, DF.literal('people.json')),
            DF.quad(DF.blankNode('ls3'), RML_SOURCE, DF.literal('http://other.example.org/pets.csv')),
            DF.quad(DF.blankNode('ls4'), RML_SOURCE, DF.blankNode('database')),
            DF.quad(DF.blankNode('ls4'), DF.namedNode('ex:other'), DF.literal('other.json')),
          ]),
        },
      })),
    };
    mediatorQuerySourceIdentify = <any> {
      mediate: jest.fn(async(_action: IActionQuerySourceIdentify) => ({ querySource: 'QUERYSOURCE' })),
    };
    rmlMapper = { map: jest.fn(async() => 'NQUADS') };
    actor = new ActorQuerySourceIdentifyRml({
      name: 'actor',
      bus,
      mediatorDereference,
      mediatorRdfParse,
      mediatorQuerySourceIdentify,
    });
    (<any> actor).rmlMapper = rmlMapper;
  });

  it('should use the comake mapper by default', () => {
    expect((<any> new ActorQuerySourceIdentifyRml({
      name: 'actor',
      bus,
      mediatorDereference,
      mediatorRdfParse,
      mediatorQuerySourceIdentify,
    })).rmlMapper).toBeInstanceOf(RmlMapperComake);
  });

  describe('test', () => {
    it('should test', async() => {
      await expect(actor.test({
        querySourceUnidentified: { type: 'rml', value: 'http://example.org/dir/mapping.ttl' },
        context,
      })).resolves.toPassTestVoid();
    });

    it('should not test with another type', async() => {
      await expect(actor.test({
        querySourceUnidentified: { type: 'file', value: 'http://example.org/dir/mapping.ttl' },
        context,
      })).resolves.toFailTest(`actor requires a single query source with rml type to be present in the context.`);
    });

    it('should not test without type', async() => {
      await expect(actor.test({
        querySourceUnidentified: { value: 'http://example.org/dir/mapping.ttl' },
        context,
      })).resolves.toFailTest(`actor requires a single query source with rml type to be present in the context.`);
    });

    it('should not test with a non-string value', async() => {
      await expect(actor.test({
        querySourceUnidentified: <any> { type: 'rml', value: { match: () => null }},
        context,
      })).resolves.toFailTest(`actor requires an rml source with the URL of a mapping document as value.`);
    });
  });

  describe('run', () => {
    it('should map and delegate to a serialized source', async() => {
      await expect(actor.run({
        querySourceUnidentified: { type: 'rml', value: 'http://example.org/dir/mapping.ttl', context: sourceContext },
        context,
      })).resolves.toEqual({ querySource: 'QUERYSOURCE' });

      expect(mediatorDereference.mediate).toHaveBeenCalledTimes(3);
      expect(mediatorDereference.mediate).toHaveBeenCalledWith({ url: 'http://example.org/dir/mapping.ttl', context });
      expect(mediatorDereference.mediate).toHaveBeenCalledWith({ url: 'http://example.org/dir/people.json', context });
      expect(mediatorDereference.mediate).toHaveBeenCalledWith({ url: 'http://other.example.org/pets.csv', context });

      expect(mediatorRdfParse.mediate).toHaveBeenCalledTimes(1);
      const parseAction: IActionRdfParseHandle = jest.mocked(mediatorRdfParse.mediate).mock.calls[0][0];
      expect(parseAction.handleMediaType).toBe('text/turtle');
      expect(parseAction.handle.metadata).toEqual({ baseIRI: 'http://example.org/dir/mapping.ttl' });
      await expect(streamToString(parseAction.handle.data)).resolves.toBe('MAPPING');

      expect(rmlMapper.map).toHaveBeenCalledTimes(1);
      expect(rmlMapper.map).toHaveBeenCalledWith('MAPPING', {
        'people.json': 'PEOPLE',
        'http://other.example.org/pets.csv': 'PETS',
      });

      expect(mediatorQuerySourceIdentify.mediate).toHaveBeenCalledTimes(1);
      expect(mediatorQuerySourceIdentify.mediate).toHaveBeenCalledWith({
        querySourceUnidentified: {
          type: 'serialized',
          value: 'NQUADS',
          mediaType: 'application/n-quads',
          context: sourceContext,
        },
        context,
      });
    });

    it('should resolve logical sources against the final URL of the mapping', async() => {
      documents['http://example.org/redirected/people.json'] = 'PEOPLE REDIRECTED';
      jest.mocked(mediatorDereference.mediate).mockImplementationOnce(async() => <any> ({
        url: 'http://example.org/redirected/mapping.ttl',
        data: Readable.from([ 'MAPPING' ]),
      }));

      await actor.run({
        querySourceUnidentified: { type: 'rml', value: 'http://example.org/dir/mapping.ttl' },
        context,
      });

      expect(rmlMapper.map).toHaveBeenCalledWith('MAPPING', {
        'people.json': 'PEOPLE REDIRECTED',
        'http://other.example.org/pets.csv': 'PETS',
      });
    });

    it('should reject if a logical source can not be fetched', async() => {
      delete documents['http://example.org/dir/people.json'];

      await expect(actor.run({
        querySourceUnidentified: { type: 'rml', value: 'http://example.org/dir/mapping.ttl' },
        context,
      })).rejects.toThrow('Not found: http://example.org/dir/people.json');
      expect(rmlMapper.map).not.toHaveBeenCalled();
    });
  });
});
