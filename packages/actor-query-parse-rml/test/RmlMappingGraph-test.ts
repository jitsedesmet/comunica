import { DataFactory } from 'rdf-data-factory';
import { RmlMappingGraph } from '../lib/RmlMappingGraph';

const DF = new DataFactory();

describe('RmlMappingGraph', () => {
  const mapping = new RmlMappingGraph([
    DF.quad(DF.namedNode('ex:s1'), DF.namedNode('ex:p'), DF.literal('a')),
    DF.quad(DF.namedNode('ex:s1'), DF.namedNode('ex:p'), DF.literal('b')),
    DF.quad(DF.blankNode('ex:s1'), DF.namedNode('ex:p'), DF.literal('c')),
    DF.quad(DF.namedNode('ex:s1'), DF.namedNode('ex:q'), DF.literal('d')),
  ]);

  it('should get the distinct subjects of a property', () => {
    expect(mapping.getSubjects('ex:p')).toEqual([ DF.namedNode('ex:s1'), DF.blankNode('ex:s1') ]);
    expect(mapping.getSubjects('ex:unknown')).toEqual([]);
  });

  it('should get the objects of a subject and property', () => {
    expect(mapping.getObjects(DF.namedNode('ex:s1'), 'ex:p')).toEqual([ DF.literal('a'), DF.literal('b') ]);
    expect(mapping.getObjects(DF.blankNode('ex:s1'), 'ex:p')).toEqual([ DF.literal('c') ]);
    expect(mapping.getObjects(DF.namedNode('ex:s1'), 'ex:unknown')).toEqual([]);
  });

  it('should get an optional object', () => {
    expect(mapping.getOptionalObject(DF.namedNode('ex:s1'), 'ex:q')).toEqual(DF.literal('d'));
    expect(mapping.getOptionalObject(DF.namedNode('ex:s1'), 'ex:unknown')).toBeUndefined();
    expect(() => mapping.getOptionalObject(DF.namedNode('ex:s1'), 'ex:p'))
      .toThrow('Expected at most one <ex:p> on ex:s1 in the RML mapping');
  });

  it('should get a required object', () => {
    expect(mapping.getRequiredObject(DF.namedNode('ex:s1'), 'ex:q')).toEqual(DF.literal('d'));
    expect(() => mapping.getRequiredObject(DF.namedNode('ex:s1'), 'ex:unknown'))
      .toThrow('Expected a <ex:unknown> on ex:s1 in the RML mapping');
  });
});
