import type { Readable } from 'node:stream';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { ActorRdfMetadataExtractSparqlService } from '../lib/ActorRdfMetadataExtractSparqlService';
import '@comunica/utils-jest';

const quad = require('rdf-quad');
const stream = require('streamify-array');

describe('ActorRdfMetadataExtractSparqlService', () => {
  let bus: any;
  let context: IActionContext;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    context = new ActionContext();
  });

  describe('The ActorRdfMetadataExtractSparqlService module', () => {
    it('should be a function', () => {
      expect(ActorRdfMetadataExtractSparqlService).toBeInstanceOf(Function);
    });

    it('should be a ActorRdfMetadataExtractSparqlService constructor', () => {
      expect(new (<any> ActorRdfMetadataExtractSparqlService)({ name: 'actor', bus }))
        .toBeInstanceOf(ActorRdfMetadataExtractSparqlService);
      expect(new (<any> ActorRdfMetadataExtractSparqlService)({ name: 'actor', bus }))
        .toBeInstanceOf(ActorRdfMetadataExtract);
    });

    it('should not be able to create new ActorRdfMetadataExtractSparqlService objects without \'new\'', () => {
      expect(() => {
        (<any> ActorRdfMetadataExtractSparqlService)();
      }).toThrow(`Class constructor ActorRdfMetadataExtractSparqlService cannot be invoked without 'new'`);
    });
  });

  describe('An ActorRdfMetadataExtractSparqlService instance', () => {
    let actor: ActorRdfMetadataExtractSparqlService;
    let input: Readable;
    let inputDefaultGraph: Readable;
    let inputAll: Readable;
    let inputNone: Readable;
    let inputRelativeLiteral: Readable;
    let inputRelativeIri: Readable;
    let inputBlankSubject: Readable;
    let inputHttpsHttp: Readable;

    beforeEach(() => {
      actor = new ActorRdfMetadataExtractSparqlService({ name: 'actor', bus, inferHttpsEndpoint: false });
      input = stream([
        quad('s1', 'p1', 'o1', ''),
        quad('http://example.org/', 'http://www.w3.org/ns/sparql-service-description#endpoint', 'http://example2.org/ENDPOINT', ''),
        quad('s2', 'px', '5678', ''),
        quad('s3', 'p3', 'o3', ''),
      ]);
      inputDefaultGraph = stream([
        quad('s1', 'p1', 'o1', ''),
        quad('URL', 'http://www.w3.org/ns/sparql-service-description#defaultGraph', 'GRAPH', ''),
        quad('s2', 'px', '5678', ''),
        quad('s3', 'p3', 'o3', ''),
      ]);
      inputAll = stream([
        quad('s1', 'p1', 'o1', ''),
        quad('URL', 'http://www.w3.org/ns/sparql-service-description#defaultGraph', 'GRAPH', ''),
        quad('s2', 'px', '5678', ''),
        quad('URL', 'http://www.w3.org/ns/sparql-service-description#endpoint', 'ENDPOINT', ''),
        quad('s3', 'p3', 'o3', ''),
      ]);
      inputNone = stream([
        quad('s1', 'p1', 'o1', ''),
      ]);
      inputRelativeLiteral = stream([
        quad('s1', 'p1', 'o1', ''),
        quad('http://example.org/', 'http://www.w3.org/ns/sparql-service-description#endpoint', '"ENDPOINT"', ''),
        quad('s2', 'px', '5678', ''),
        quad('s3', 'p3', 'o3', ''),
      ]);
      inputRelativeIri = stream([
        quad('s1', 'p1', 'o1', ''),
        quad('http://example.org/', 'http://www.w3.org/ns/sparql-service-description#endpoint', 'ENDPOINT', ''),
        quad('s2', 'px', '5678', ''),
        quad('s3', 'p3', 'o3', ''),
      ]);
      inputBlankSubject = stream([
        quad('_:b', 'p1', 'o1', ''),
        quad('_:b', 'http://www.w3.org/ns/sparql-service-description#endpoint', 'http://example2.org/ENDPOINT', ''),
        quad('_:b', 'px', '5678', ''),
        quad('s3', 'p3', 'o3', ''),
      ]);
      inputHttpsHttp = stream([
        quad('s1', 'p1', 'o1', ''),
        quad('https://example.org/', 'http://www.w3.org/ns/sparql-service-description#endpoint', 'http://example2.org/ENDPOINT', ''),
        quad('s2', 'px', '5678', ''),
        quad('s3', 'p3', 'o3', ''),
      ]);
    });

    it('should test', async() => {
      await expect(actor
        .test({ url: 'http://example.org/', metadata: input, requestTime: 0, context })).resolves.toPassTestVoid();
    });

    it('should run on a stream where an endpoint is defined', async() => {
      await expect(actor.run({ url: 'http://example.org/', metadata: input, requestTime: 0, context })).resolves
        .toEqual({ metadata: { sparqlService: 'http://example2.org/ENDPOINT' }});
    });

    it('should run on a stream where an endpoint is defined, but for another URL', async() => {
      await expect(actor.run({ url: 'http://example2.org/', metadata: input, requestTime: 0, context })).resolves
        .toEqual({ metadata: {}});
    });

    it('should run on a stream where a default graph is defined', async() => {
      await expect(actor.run({ url: 'URL', metadata: inputDefaultGraph, requestTime: 0, context })).resolves
        .toEqual({ metadata: { defaultGraph: 'GRAPH' }});
    });

    it('should run on a stream where an endpoint and default graph is defined', async() => {
      await expect(actor.run({ url: 'URL', metadata: inputAll, requestTime: 0, context })).resolves
        .toEqual({ metadata: { sparqlService: 'ENDPOINT', defaultGraph: 'GRAPH' }});
    });

    it('should run on a stream where an endpoint is not given', async() => {
      await expect(actor.run({ url: 'http://example.org/', metadata: inputNone, requestTime: 0, context })).resolves
        .toEqual({ metadata: {}});
    });

    it('should run on a stream where an endpoint is defined as a relative IRI in a literal', async() => {
      await expect(actor
        .run({ url: 'http://example.org/', metadata: inputRelativeLiteral, requestTime: 0, context })).resolves
        .toEqual({ metadata: { sparqlService: 'http://example.org/ENDPOINT' }});
    });

    it('should run on a stream where an endpoint is defined as a relative IRI in a named node', async() => {
      await expect(actor
        .run({ url: 'http://example.org/', metadata: inputRelativeIri, requestTime: 0, context })).resolves
        .toEqual({ metadata: { sparqlService: 'ENDPOINT' }});
    });

    it('should run on a stream where the service description subject is a blank node', async() => {
      await expect(actor
        .run({ url: 'http://example.org/', metadata: inputBlankSubject, requestTime: 0, context })).resolves
        .toEqual({ metadata: { sparqlService: 'http://example2.org/ENDPOINT' }});
    });

    it('should run on a stream where https refers to http', async() => {
      await expect(actor
        .run({ url: 'https://example.org/', metadata: inputHttpsHttp, requestTime: 0, context })).resolves
        .toEqual({ metadata: { sparqlService: 'http://example2.org/ENDPOINT' }});
    });

    it('should run on a stream where https refers to http with inferHttpsEndpoint', async() => {
      actor = new ActorRdfMetadataExtractSparqlService({ name: 'actor', bus, inferHttpsEndpoint: true });
      await expect(actor
        .run({ url: 'https://example.org/', metadata: inputHttpsHttp, requestTime: 0, context })).resolves
        .toEqual({ metadata: { sparqlService: 'https://example2.org/ENDPOINT' }});
    });
  });
});
