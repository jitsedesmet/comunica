import { RmlMapperComake } from '../lib/RmlMapperComake';

describe('RmlMapperComake', () => {
  it('should map JSON to N-Quads', async() => {
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
    const inputFiles = { 'people.json': JSON.stringify({ people: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]}) };

    const output = await new RmlMapperComake().map(mapping, inputFiles);

    expect(output.trim().split('\n').sort()).toEqual([
      '<http://example.org/person/1> <http://xmlns.com/foaf/0.1/name> "Alice" .',
      '<http://example.org/person/2> <http://xmlns.com/foaf/0.1/name> "Bob" .',
    ]);
  });
});
