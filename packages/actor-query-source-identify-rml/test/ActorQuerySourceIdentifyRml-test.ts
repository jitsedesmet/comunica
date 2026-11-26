import type { IActionDereference, MediatorDereference } from '@comunica/bus-dereference';
import type { IActionQuerySourceIdentify, MediatorQuerySourceIdentify } from '@comunica/bus-query-source-identify';
import type { IActionRdfParseHandle, MediatorRdfParseHandle } from '@comunica/bus-rdf-parse';
import { ActionContext, Bus } from '@comunica/core';
import { stringify as streamToString } from '@jeswr/stream-to-string';
import { DataFactory } from 'rdf-data-factory';
import { Readable } from 'readable-stream';
import { streamifyArray } from 'streamify-array';
import { ActorQuerySourceIdentifyRml } from '../lib/ActorQuerySourceIdentifyRml';
import '@comunica/utils-jest';

const DF = new DataFactory();
const RML_SOURCE = DF.namedNode('http://semweb.mmlab.be/ns/rml#source');

describe('ActorQuerySourceIdentifyRml', () => {
  let bus: any;
  let documents: Record<string, string>;
  let mediatorDereference: MediatorDereference;
  let mediatorRdfParse: MediatorRdfParseHandle;
  let mediatorQuerySourceIdentify: MediatorQuerySourceIdentify;
  let map: jest.SpyInstance;
  let actor: ActorQuerySourceIdentifyRml;
  const context = new ActionContext({ q: 'query' });
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
    actor = new ActorQuerySourceIdentifyRml({
      name: 'actor',
      bus,
      mediatorDereference,
      mediatorRdfParse,
      mediatorQuerySourceIdentify,
    });
    map = jest.spyOn(<any> actor, 'map').mockResolvedValue('NQUADS');
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
      // The source context applies to all fetches
      const fetchContext = context.merge(sourceContext);
      for (const url of Object.keys(documents)) {
        expect(mediatorDereference.mediate).toHaveBeenCalledWith({ url, context: fetchContext });
      }

      expect(mediatorRdfParse.mediate).toHaveBeenCalledTimes(1);
      const parseAction: IActionRdfParseHandle = jest.mocked(mediatorRdfParse.mediate).mock.calls[0][0];
      expect(parseAction.context).toEqual(fetchContext);
      expect(parseAction.handleMediaType).toBe('text/turtle');
      expect(parseAction.handle.metadata).toEqual({ baseIRI: 'http://example.org/dir/mapping.ttl' });
      await expect(streamToString(parseAction.handle.data)).resolves.toBe('MAPPING');

      expect(map).toHaveBeenCalledTimes(1);
      expect(map).toHaveBeenCalledWith('MAPPING', {
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

      expect(mediatorDereference.mediate).toHaveBeenCalledWith({ url: 'http://example.org/dir/mapping.ttl', context });
      expect(map).toHaveBeenCalledWith('MAPPING', {
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
      expect(map).not.toHaveBeenCalled();
    });
  });

  describe('map', () => {
    it('should map JSON to N-Quads', async() => {
      map.mockRestore();
      const mapping = `
@prefix rr: <http://www.w3.org/ns/r2rml#> .
@prefix rml: <http://semweb.mmlab.be/ns/rml#> .
@prefix ql: <http://semweb.mmlab.be/ns/ql#> .

<http://example.org/mapping#People>
  rml:logicalSource [
    rml:source "people.json";
    rml:referenceFormulation ql:JSONPath;
    rml:iterator "$.people[*]"
  ];
  rr:subjectMap [ rr:template "http://example.org/person/{id}" ];
  rr:predicateObjectMap [
    rr:predicate <http://xmlns.com/foaf/0.1/name>;
    rr:objectMap [ rml:reference "name" ]
  ].
`;
      const people = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
      const inputFiles = { 'people.json': JSON.stringify({ people }) };

      const output: string = await (<any> actor).map(mapping, inputFiles);

      expect(output.trim().split('\n').sort()).toEqual([
        '<http://example.org/person/1> <http://xmlns.com/foaf/0.1/name> "Alice" .',
        '<http://example.org/person/2> <http://xmlns.com/foaf/0.1/name> "Bob" .',
      ]);
    });
  });
});
