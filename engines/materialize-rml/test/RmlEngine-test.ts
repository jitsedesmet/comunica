import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as RDF from '@rdfjs/types';
import 'jest-rdf';
import { DataFactory } from 'rdf-data-factory';
import { RmlEngine } from '../lib/RmlEngine';

const DF = new DataFactory();
const assets = path.join(__dirname, 'assets');
const person = (id: number): RDF.NamedNode => DF.namedNode(`http://example.org/person/${id}`);
const ex = (localName: string): RDF.NamedNode => DF.namedNode(`http://example.org/${localName}`);
const foaf = (localName: string): RDF.NamedNode => DF.namedNode(`http://xmlns.com/foaf/0.1/${localName}`);
const xsd = (localName: string): RDF.NamedNode => DF.namedNode(`http://www.w3.org/2001/XMLSchema#${localName}`);
const type = DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');

describe('System test: RmlEngine', () => {
  let engine: RmlEngine;

  beforeEach(() => {
    engine = new RmlEngine();
  });

  it('should generate the quads of a mapping over CSV files', async() => {
    const quads = await engine.materialize(readFileSync(path.join(assets, 'mapping.ttl'), 'utf8'), {
      baseIRI: 'http://example.org/',
      mappingDirectory: `${pathToFileURL(assets).href}/`,
    });

    await expect(quads.toArray()).resolves.toBeRdfIsomorphic([
      DF.quad(person(1), type, foaf('Person')),
      DF.quad(person(1), foaf('name'), DF.literal('Alice', 'en')),
      DF.quad(person(1), ex('id'), DF.literal('1', xsd('integer'))),
      DF.quad(person(1), ex('address'), DF.blankNode('address1'), ex('addresses')),
      DF.quad(person(1), ex('livesIn'), ex('city/Ghent')),
      // Bob has no city, so he lives nowhere
      DF.quad(person(2), type, foaf('Person')),
      DF.quad(person(2), foaf('name'), DF.literal('Bob', 'en')),
      DF.quad(person(2), ex('id'), DF.literal('2', xsd('integer'))),
      DF.quad(person(2), ex('address'), DF.blankNode('address2'), ex('addresses')),
      DF.quad(person(3), type, foaf('Person')),
      DF.quad(person(3), foaf('name'), DF.literal('Carol, PhD', 'en')),
      DF.quad(person(3), ex('id'), DF.literal('3', xsd('integer'))),
      DF.quad(person(3), ex('address'), DF.blankNode('address3'), ex('addresses')),
      DF.quad(person(3), ex('livesIn'), ex('city/Bruges')),
      // A graph map that generates no graph for Bob does not hide his quad in the default graph
      ...[ 1, 2, 3 ].map(id => DF.quad(person(id), ex('known'), DF.literal('true', xsd('boolean')))),
      DF.quad(person(1), ex('known'), DF.literal('true', xsd('boolean')), ex('graph/Ghent')),
      DF.quad(person(3), ex('known'), DF.literal('true', xsd('boolean')), ex('graph/Bruges')),
      DF.quad(ex('city/Ghent'), ex('country'), DF.literal('Belgium')),
      DF.quad(ex('city/Bruges'), ex('country'), DF.literal('Belgium')),
    ]);
  });

  it('should reject a mapping that generates an invalid IRI', async() => {
    const quads = await engine.materialize(`
@prefix rml: <http://w3id.org/rml/> .
<http://example.org/PersonMap> rml:logicalSource [ rml:source "people.csv" ] ;
  rml:subjectMap [ rml:reference "name" ] ;
  rml:predicateObjectMap [ rml:predicate <http://example.org/a> ; rml:object <http://example.org/b> ] .`, {
      baseIRI: 'http://example.org/',
      mappingDirectory: `${pathToFileURL(assets).href}/`,
    });
    await expect(quads.toArray()).rejects
      .toThrow(`The RML mapping generates the invalid IRI 'http://example.org/Carol, PhD'`);
  });
});
