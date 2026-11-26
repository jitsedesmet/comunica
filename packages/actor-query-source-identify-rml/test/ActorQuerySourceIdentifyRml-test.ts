import type { IActionDereference, MediatorDereference } from '@comunica/bus-dereference';
import type { IActionQuerySourceIdentify, MediatorQuerySourceIdentify } from '@comunica/bus-query-source-identify';
import type { IActionRdfParseHandle, MediatorRdfParseHandle } from '@comunica/bus-rdf-parse';
import { KeysDereference } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { Readable } from 'readable-stream';
import { streamifyArray } from 'streamify-array';
import { ActorQuerySourceIdentifyRml } from '../lib/ActorQuerySourceIdentifyRml';
import '@comunica/utils-jest';

const DF = new DataFactory();
const RML_SOURCE = DF.namedNode('http://semweb.mmlab.be/ns/rml#source');
const MAPPING_URL = 'http://example.org/dir/mapping.ttl';

describe('ActorQuerySourceIdentifyRml', () => {
  let bus: any;
  let documents: Record<string, string | Buffer[]>;
  let mappingQuads: RDF.Quad[];
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
      [MAPPING_URL]: 'MAPPING',
      'http://example.org/dir/people.json': 'PEOPLE',
      'http://other.example.org/pets.csv': 'PETS',
    };
    mappingQuads = [
      DF.quad(DF.namedNode('http://example.org/dir/mapping.ttl#M'), DF.namedNode('ex:p'), DF.blankNode('ls1')),
      DF.quad(DF.blankNode('ls1'), RML_SOURCE, DF.literal('people.json')),
      DF.quad(DF.blankNode('ls2'), RML_SOURCE, DF.literal('people.json')),
      DF.quad(DF.blankNode('ls3'), RML_SOURCE, DF.literal('http://other.example.org/pets.csv')),
    ];
    mediatorDereference = <any> {
      mediate: jest.fn(async({ url }: IActionDereference) => {
        if (!(url in documents)) {
          throw new Error(`Not found: ${url}`);
        }
        const document = documents[url];
        return { url, exists: true, data: Readable.from(typeof document === 'string' ? [ document ] : document) };
      }),
    };
    mediatorRdfParse = <any> {
      mediate: jest.fn(async(_action: IActionRdfParseHandle) => ({ handle: { data: streamifyArray(mappingQuads) }})),
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
        querySourceUnidentified: { type: 'rml', value: MAPPING_URL },
        context,
      })).resolves.toPassTestVoid();
    });

    it('should not test with another type', async() => {
      await expect(actor.test({
        querySourceUnidentified: { type: 'file', value: MAPPING_URL },
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
        querySourceUnidentified: { type: 'rml', value: MAPPING_URL, context: sourceContext },
        context,
      })).resolves.toEqual({ querySource: 'QUERYSOURCE' });

      // The source context applies to all fetches, and logical sources of a Web mapping may not be local files
      const fetchContext = context.merge(sourceContext);
      const logicalSourceContext = fetchContext.set(KeysDereference.blockFileAccess, true);
      expect(mediatorDereference.mediate).toHaveBeenCalledTimes(3);
      expect(mediatorDereference.mediate).toHaveBeenCalledWith({ url: MAPPING_URL, context: fetchContext });
      expect(mediatorDereference.mediate)
        .toHaveBeenCalledWith({ url: 'http://example.org/dir/people.json', context: logicalSourceContext });
      expect(mediatorDereference.mediate)
        .toHaveBeenCalledWith({ url: 'http://other.example.org/pets.csv', context: logicalSourceContext });

      expect(mediatorRdfParse.mediate).toHaveBeenCalledTimes(1);
      const parseAction: IActionRdfParseHandle = jest.mocked(mediatorRdfParse.mediate).mock.calls[0][0];
      expect(parseAction.context).toEqual(fetchContext);
      expect(parseAction.handleMediaType).toBe('text/turtle');
      expect(parseAction.handle.metadata).toEqual({ baseIRI: MAPPING_URL });
      await expect(parseAction.handle.data.toArray()).resolves.toEqual([ 'MAPPING' ]);

      // The mapper receives the mapping with absolute IRIs
      expect(map).toHaveBeenCalledTimes(1);
      expect(map).toHaveBeenCalledWith(`<http://example.org/dir/mapping.ttl#M> <ex:p> _:ls1 .
_:ls1 <http://semweb.mmlab.be/ns/rml#source> "people.json" .
_:ls2 <http://semweb.mmlab.be/ns/rml#source> "people.json" .
_:ls3 <http://semweb.mmlab.be/ns/rml#source> "http://other.example.org/pets.csv" .`, {
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
      documents['file:///redirected/people.json'] = 'PEOPLE LOCAL';
      jest.mocked(mediatorDereference.mediate).mockImplementationOnce(async() => <any> ({
        url: 'file:///redirected/mapping.ttl',
        exists: true,
        data: Readable.from([ 'MAPPING' ]),
      }));

      await actor.run({ querySourceUnidentified: { type: 'rml', value: 'mapping.ttl' }, context });

      // Logical sources of a local mapping may be local files
      expect(mediatorDereference.mediate).toHaveBeenCalledWith({ url: 'mapping.ttl', context });
      expect(mediatorDereference.mediate).toHaveBeenCalledWith({ url: 'file:///redirected/people.json', context });
      expect(map).toHaveBeenCalledWith(expect.anything(), {
        'people.json': 'PEOPLE LOCAL',
        'http://other.example.org/pets.csv': 'PETS',
      });
    });

    it('should decode characters that are split across chunks', async() => {
      const bytes = Buffer.from('{"name":"José"}');
      const split = bytes.indexOf(0xC3) + 1;
      documents['http://example.org/dir/people.json'] = [ bytes.subarray(0, split), bytes.subarray(split) ];

      await actor.run({ querySourceUnidentified: { type: 'rml', value: MAPPING_URL }, context });

      expect(map).toHaveBeenCalledWith(expect.anything(), {
        'people.json': '{"name":"José"}',
        'http://other.example.org/pets.csv': 'PETS',
      });
    });

    it('should reject if a logical source can not be fetched', async() => {
      delete documents['http://example.org/dir/people.json'];

      await expect(actor.run({ querySourceUnidentified: { type: 'rml', value: MAPPING_URL }, context }))
        .rejects.toThrow('Not found: http://example.org/dir/people.json');
      expect(map).not.toHaveBeenCalled();
    });

    it('should reject if a document does not exist in lenient mode', async() => {
      jest.mocked(mediatorDereference.mediate).mockImplementationOnce(async() => <any> ({
        url: MAPPING_URL,
        exists: false,
        data: Readable.from([]),
      }));

      await expect(actor.run({ querySourceUnidentified: { type: 'rml', value: MAPPING_URL }, context }))
        .rejects.toThrow('actor could not fetch http://example.org/dir/mapping.ttl');
      expect(map).not.toHaveBeenCalled();
    });

    it('should reject for logical sources that are not referred to by name', async() => {
      mappingQuads.push(DF.quad(DF.blankNode('ls4'), RML_SOURCE, DF.namedNode('http://example.org/dir/people.json')));

      await expect(actor.run({ querySourceUnidentified: { type: 'rml', value: MAPPING_URL }, context })).rejects
        .toThrow('actor only supports logical sources that are referred to by name, but got <http://example.org/dir/people.json>');
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
