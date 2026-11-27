import { ActorQueryParse } from '@comunica/bus-query-parse';
import { KeysInitQuery, KeysQueryParseRml } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { Algebra, AlgebraFactory } from '@comunica/utils-algebra';
import arrayifyStream from 'arrayify-stream';
import { Parser } from 'n3';
import { DataFactory } from 'rdf-data-factory';
import { Readable } from 'readable-stream';
import { ActorQueryParseRml } from '../lib/ActorQueryParseRml';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);

const PREFIXES = `
@prefix rml: <http://w3id.org/rml/> .
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;
const LOGICAL_SOURCE = `rml:logicalSource [ rml:source "people.csv" ]`;
const SUBJECT_MAP = `rml:subjectMap [ rml:template "http://example.org/person/{id}" ]`;

const term = AF.createTermExpression.bind(AF);
const variable = (name: string): Algebra.Expression => term(DF.variable(name));
const literal = (value: string): Algebra.Expression => term(DF.literal(value));
const iri = (value: string): Algebra.Expression => term(DF.namedNode(value));
const operator = AF.createOperatorExpression.bind(AF);
function named(name: string, args: Algebra.Expression[]): Algebra.Expression {
  return AF.createNamedExpression(DF.namedNode(name), args);
}
const str = (name: string): Algebra.Expression => operator('str', [ variable(name) ]);
const encodeForIri = (name: string): Algebra.Expression => named('internal://rml/encode-for-iri', [ str(name) ]);
function toIri(value: Algebra.Expression, baseIRI = ''): Algebra.Expression {
  return named('internal://rml/to-iri', [ value, literal(baseIRI) ]);
}
function bound(...names: string[]): Algebra.Expression {
  return names
    .map(name => operator('bound', [ variable(name) ]))
    .reduce((left, right) => operator('&&', [ left, right ]));
}
function reference(name: string, referenceExpression: string): Algebra.RmlLogicalSourceReference {
  return { variable: DF.variable(name), reference: referenceExpression };
}
const DEFAULT_GRAPH_EXPRESSION = term(DF.defaultGraph());
function personIri(baseIRI = ''): Algebra.Expression {
  return toIri(operator('concat', [ literal('http://example.org/person/'), encodeForIri('reference0') ]), baseIRI);
}
const CSV = 'http://w3id.org/rml/CSV';

/**
 * Unwrap the extends of the operation that generates the quads of a single predicate, object and graph map.
 */
function getQuadOperationParts(quadOperation: Algebra.Operation): {
  projectedVariables: string[];
  expressions: Record<string, Algebra.Expression>;
  input: Algebra.Operation;
} {
  const expressions: Record<string, Algebra.Expression> = {};
  let input = (<Algebra.Project> quadOperation).input;
  while (input.type === Algebra.Types.EXTEND) {
    const extend = <Algebra.Extend> input;
    expressions[extend.variable.value] = extend.expression;
    input = extend.input;
  }
  return {
    projectedVariables: (<Algebra.Project> quadOperation).variables.map(projected => projected.value),
    expressions,
    input,
  };
}

describe('ActorQueryParseRml', () => {
  let actor: ActorQueryParseRml;
  let context: IActionContext;
  let mediatorRdfParse: any;

  /**
   * Translate the given triples maps, and unwrap the operations below the root construct, distinct and union.
   */
  async function translate(triplesMaps: string, baseIRI?: string): Promise<ReturnType<typeof getQuadOperationParts>[]> {
    const { operation } = await actor.run({ query: `${PREFIXES}${triplesMaps}`, baseIRI, context });
    const filter = <Algebra.Filter> (<Algebra.Distinct> (<Algebra.Construct> operation).input).input;
    return (<Algebra.Union> filter.input).input.map(getQuadOperationParts);
  }

  beforeEach(() => {
    mediatorRdfParse = {
      mediate: jest.fn(async(action: any) => {
        const turtle = (await arrayifyStream(action.handle.data)).join('');
        return { handle: { data: Readable.from(new Parser({ factory: DF }).parse(turtle)) }};
      }),
    };
    actor = new ActorQueryParseRml({ name: 'actor', bus: new Bus({ name: 'bus' }), mediatorRdfParse });
    context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
  });

  it('should be an ActorQueryParse', () => {
    expect(actor).toBeInstanceOf(ActorQueryParse);
  });

  describe('test', () => {
    it('should pass on the rml format', async() => {
      await expect(actor.test({ query: '', queryFormat: { language: 'rml', version: '1.0' }, context }))
        .resolves.toPassTestVoid();
    });

    it('should fail on other formats', async() => {
      await expect(actor.test({ query: '', queryFormat: { language: 'sparql', version: '1.1' }, context }))
        .resolves.toFailTest('This actor can only parse RML mappings');
      await expect(actor.test({ query: '', context })).resolves.toFailTest('This actor can only parse RML mappings');
    });
  });

  describe('run', () => {
    it('should translate a triples map into a construct over its logical source', async() => {
      const { operation } = await actor.run({
        query: `${PREFIXES}
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ;
  rml:predicateObjectMap [ rml:predicate ex:name ; rml:objectMap [ rml:reference "name" ] ] .`,
        baseIRI: 'http://base.org/',
        context,
      });

      expect(mediatorRdfParse.mediate).toHaveBeenCalledWith(expect.objectContaining({
        handle: expect.objectContaining({ metadata: { baseIRI: 'http://base.org/' }}),
        handleMediaType: 'text/turtle',
      }));
      const quadVariables = [ 'subject', 'predicate', 'object', 'graph' ].map(name => DF.variable(name));
      let quadOperation: Algebra.Operation = AF
        .createRmlLogicalSource('people.csv', CSV, [ reference('reference0', 'id'), reference('reference1', 'name') ]);
      quadOperation = AF.createExtend(quadOperation, quadVariables[0], personIri('http://base.org/'));
      quadOperation = AF.createExtend(quadOperation, quadVariables[1], iri('http://example.org/name'));
      quadOperation = AF.createExtend(quadOperation, quadVariables[2], variable('reference1'));
      quadOperation = AF.createExtend(quadOperation, quadVariables[3], DEFAULT_GRAPH_EXPRESSION);
      expect(operation).toEqual(AF.createConstruct(
        AF.createDistinct(AF.createFilter(
          AF.createUnion([ AF.createProject(quadOperation, quadVariables) ]),
          bound('subject', 'predicate', 'object', 'graph'),
        )),
        [ AF.createPattern(quadVariables[0], quadVariables[1], quadVariables[2], quadVariables[3]) ],
      ));
    });

    it('should read the logical source', async() => {
      const [{ input }] = await translate(`
ex:PersonMap ${SUBJECT_MAP} ; rml:predicateObjectMap [ rml:predicate ex:a ; rml:object ex:b ] ;
  rml:logicalSource [ rml:source [ rml:path "people.xml" ] ; rml:referenceFormulation rml:XPath ; rml:iterator "//p" ] .`);
      expect(input).toEqual(AF.createRmlLogicalSource(
        'people.xml',
        'http://w3id.org/rml/XPath',
        [ reference('reference0', 'id') ],
        '//p',
      ));
    });

    it('should resolve source paths against the mapping directory', async() => {
      context = context.set(KeysQueryParseRml.mappingDirectory, 'file:///mappings/');
      const quadOperations = await translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ; rml:predicateObjectMap [ rml:predicate ex:a ; rml:object ex:b ] .
ex:CityMap ${SUBJECT_MAP} ; rml:predicateObjectMap [ rml:predicate ex:a ; rml:object ex:b ] ;
  rml:logicalSource [ rml:source [ rml:path "cities.csv" ; rml:root rml:MappingDirectory ] ] .
ex:CountryMap ${SUBJECT_MAP} ; rml:predicateObjectMap [ rml:predicate ex:a ; rml:object ex:b ] ;
  rml:logicalSource [ rml:source [ rml:path "countries.csv" ; rml:root rml:CurrentWorkingDirectory ] ] .`);
      expect(quadOperations.map(({ input }) => (<Algebra.RmlLogicalSource> input).sourceUrl))
        .toEqual([ 'file:///mappings/people.csv', 'file:///mappings/cities.csv', 'countries.csv' ]);
    });

    it('should translate every kind of term map', async() => {
      const quadOperations = await translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; rml:subject ex:subject ;
  rml:predicateObjectMap [
    rml:predicateMap [ rml:reference "property" ; rml:termType rml:IRI ] ;
    rml:object ex:shortcut ;
    rml:objectMap [ rml:constant "constant" ; rml:termType rml:Literal ] ;
    rml:objectMap [ rml:reference "age" ] ;
    rml:objectMap [ rml:reference "age" ; rml:datatype xsd:integer ] ;
    rml:objectMap [ rml:template "{name}" ; rml:language "en" ] ;
    rml:objectMap [ rml:template "{id} {name}" ; rml:termType rml:Literal ] ;
    rml:objectMap [ rml:template "address {id}" ; rml:termType rml:BlankNode ] ;
    rml:objectMap [ rml:template "http://example.org/static" ] ;
    rml:objectMap [ rml:template "http://example.org/{id}" ; rml:termType rml:URI ] ;
    rml:objectMap [ rml:reference "homepage" ; rml:termType rml:UnsafeIRI ] ;
    rml:objectMap [ rml:reference "age" ; rml:datatypeMap [ rml:template "http://example.org/{type}" ] ] ;
    rml:objectMap [ rml:reference "name" ; rml:languageMap [ rml:reference "language" ] ] ;
  ] .`);

      for (const { expressions, projectedVariables } of quadOperations) {
        expect(projectedVariables).toEqual([ 'subject', 'predicate', 'object', 'graph' ]);
        expect(expressions.subject).toEqual(iri('http://example.org/subject'));
        expect(expressions.predicate).toEqual(toIri(str('reference0')));
        expect(expressions.graph).toEqual(DEFAULT_GRAPH_EXPRESSION);
      }
      expect(quadOperations.map(({ expressions }) => expressions.object)).toEqual([
        iri('http://example.org/shortcut'),
        literal('constant'),
        variable('reference1'),
        operator('strdt', [ str('reference1'), iri('http://www.w3.org/2001/XMLSchema#integer') ]),
        operator('strlang', [ str('reference1'), literal('en') ]),
        operator('concat', [ str('reference1'), literal(' '), str('reference2') ]),
        named('internal://blank', [ operator('concat', [ literal('address '), str('reference1') ]) ]),
        toIri(literal('http://example.org/static')),
        toIri(operator('concat', [
          literal('http://example.org/'),
          operator('encode_for_uri', [ str('reference1') ]),
        ])),
        operator('iri', [ str('reference1') ]),
        operator('strdt', [
          str('reference1'),
          toIri(operator('concat', [ literal('http://example.org/'), encodeForIri('reference2') ])),
        ]),
        operator('strlang', [ str('reference1'), variable('reference2') ]),
      ]);
    });

    it('should translate classes and graphs', async() => {
      const quadOperations = await translate(`
ex:PersonMap ${LOGICAL_SOURCE} ;
  rml:subjectMap [ rml:template "http://example.org/person/{id}" ; rml:class ex:Person ; rml:graph ex:subjectGraph ] ;
  rml:predicateObjectMap [
    rml:predicate ex:a ; rml:object ex:b ;
    rml:graphMap [ rml:template "http://example.org/graph/{id}" ] ;
    rml:graph rml:defaultGraph ;
  ] .`);

      expect(quadOperations.map(({ expressions }) => expressions.object)).toEqual([
        iri('http://example.org/Person'),
        iri('http://example.org/b'),
        iri('http://example.org/b'),
        iri('http://example.org/b'),
      ]);
      expect(quadOperations.map(({ expressions }) => expressions.graph)).toEqual([
        iri('http://example.org/subjectGraph'),
        iri('http://example.org/subjectGraph'),
        DEFAULT_GRAPH_EXPRESSION,
        toIri(operator('concat', [ literal('http://example.org/graph/'), encodeForIri('reference0') ])),
      ]);
      expect(quadOperations[0].expressions.predicate)
        .toEqual(iri('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'));
    });

    it('should resolve generated IRIs against the base IRI of the triples map', async() => {
      const [{ expressions }] = await translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ; rml:baseIRI <http://triples-map.org/> ;
  rml:predicateObjectMap [ rml:predicate ex:a ; rml:object ex:b ] .`, 'http://base.org/');
      expect(expressions.subject).toEqual(personIri('http://triples-map.org/'));
    });

    it('should join a parent triples map on its join conditions', async() => {
      const [{ expressions, input }] = await translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ;
  rml:predicateObjectMap [ rml:predicate ex:livesIn ; rml:objectMap [
    rml:parentTriplesMap ex:CityMap ;
    rml:joinCondition [ rml:child "city" ; rml:parent "name" ] ;
    rml:joinCondition [
      rml:childMap [ rml:template "{country}-{id}" ] ;
      rml:parentMap [ rml:constant "BE-1" ] ;
    ] ;
  ] ] .
ex:CityMap rml:logicalSource [ rml:source "cities.csv" ] ;
  rml:subjectMap [ rml:template "http://example.org/{name}/{population}" ] .`);

      const joinVariables = [ DF.variable('joinValue0'), DF.variable('joinValue1') ];
      let child: Algebra.Operation = AF.createRmlLogicalSource('people.csv', CSV, [
        reference('reference0', 'id'),
        reference('reference1', 'city'),
        reference('reference2', 'country'),
      ]);
      child = AF.createExtend(child, joinVariables[0], str('reference1'));
      child = AF.createExtend(
        child,
        joinVariables[1],
        operator('concat', [ str('reference2'), literal('-'), str('reference0') ]),
      );
      let parent: Algebra.Operation = AF.createRmlLogicalSource('cities.csv', CSV, [
        reference('parentReference0', 'name'),
        reference('parentReference1', 'population'),
      ]);
      parent = AF.createExtend(parent, joinVariables[0], str('parentReference0'));
      parent = AF.createExtend(parent, joinVariables[1], literal('BE-1'));
      expect(input).toEqual(AF.createJoin([
        AF.createFilter(child, bound('joinValue0', 'joinValue1')),
        AF.createFilter(parent, bound('joinValue0', 'joinValue1')),
      ]));
      expect(expressions.subject).toEqual(personIri());
      expect(expressions.object).toEqual(toIri(operator('concat', [
        literal('http://example.org/'),
        encodeForIri('parentReference0'),
        literal('/'),
        encodeForIri('parentReference1'),
      ])));
    });

    it('should read a parent triples map without join conditions from the same logical source', async() => {
      const [{ expressions, input }] = await translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ;
  rml:predicateObjectMap [ rml:predicate ex:livesIn ; rml:objectMap [ rml:parentTriplesMap ex:CityMap ] ] .
ex:CityMap ${LOGICAL_SOURCE} ; rml:subjectMap [ rml:template "http://example.org/city/{city}" ] .`);

      expect(input).toEqual(AF
        .createRmlLogicalSource('people.csv', CSV, [ reference('reference0', 'id'), reference('reference1', 'city') ]));
      expect(expressions.object).toEqual(
        toIri(operator('concat', [ literal('http://example.org/city/'), encodeForIri('reference1') ])),
      );
    });

    it('should join a parent triples map of another logical source without join conditions', async() => {
      const [{ input }] = await translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ;
  rml:predicateObjectMap [ rml:predicate ex:livesIn ; rml:objectMap [ rml:parentTriplesMap ex:CityMap ] ] .
ex:CityMap rml:logicalSource [ rml:source "cities.csv" ] ;
  rml:subjectMap [ rml:template "http://example.org/city/{city}" ] .`);

      expect(input).toEqual(AF.createJoin([
        AF.createRmlLogicalSource('people.csv', CSV, [ reference('reference0', 'id') ]),
        AF.createRmlLogicalSource('cities.csv', CSV, [ reference('parentReference0', 'city') ]),
      ]));
    });

    it('should translate a triples map without predicate-object maps into no quads', async() => {
      const query = `${PREFIXES}ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} .`;
      const { operation } = await actor.run({ query, context });
      const filter = <Algebra.Filter> (<Algebra.Distinct> (<Algebra.Construct> operation).input).input;
      expect(filter.input).toEqual(AF.createValues(
        [ 'subject', 'predicate', 'object', 'graph' ].map(name => DF.variable(name)),
        [],
      ));
    });

    it('should reject unsupported properties', async() => {
      await expect(translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ; rml:logicalTarget [] .`))
        .rejects.toThrow('The RML property <http://w3id.org/rml/logicalTarget> is not supported');
    });

    it('should reject a mapping without triples maps', async() => {
      await expect(translate('ex:a ex:b ex:c .')).rejects
        .toThrow('The RML mapping has no triples map with a <http://w3id.org/rml/logicalSource>');
    });

    it('should reject a triples map without exactly one subject map', async() => {
      await expect(translate(`ex:PersonMap ${LOGICAL_SOURCE} .`))
        .rejects.toThrow('Expected exactly one subject map on the RML triples map http://example.org/PersonMap');
      await expect(translate(`ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ; rml:subject ex:a .`))
        .rejects.toThrow('Expected exactly one subject map on the RML triples map http://example.org/PersonMap');
    });

    it('should reject a term map without constant, reference or template', async() => {
      await expect(translate(`ex:PersonMap ${LOGICAL_SOURCE} ; rml:subjectMap ex:SubjectMap .`))
        .rejects.toThrow('Expected a constant, reference or template on the RML map http://example.org/SubjectMap');
    });

    it('should reject a term type that its position does not allow', async() => {
      await expect(translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; rml:subjectMap [ rml:reference "id" ; rml:termType rml:Unknown ] .`))
        .rejects.toThrow('The RML term type <http://w3id.org/rml/Unknown> is not supported for a subject');
      await expect(translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; rml:subjectMap [ rml:reference "id" ; rml:termType rml:Literal ] .`))
        .rejects.toThrow('The RML term type <http://w3id.org/rml/Literal> is not supported for a subject');
      await expect(translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ; rml:predicateObjectMap [
  rml:predicateMap [ rml:reference "id" ; rml:termType rml:BlankNode ] ; rml:object ex:a ] .`))
        .rejects.toThrow('The RML term type <http://w3id.org/rml/BlankNode> is not supported for a predicate');
    });

    it('should reject a constant that its position or declared term type does not allow', async() => {
      await expect(translate(`ex:PersonMap ${LOGICAL_SOURCE} ; rml:subject "literal" .`))
        .rejects.toThrow(`The constant Literal 'literal' is not allowed as RML subject`);
      await expect(translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; rml:subjectMap [ rml:constant "School" ; rml:termType rml:BlankNode ] .`))
        .rejects.toThrow(`The constant Literal 'School' is not allowed as RML <http://w3id.org/rml/BlankNode> subject`);
    });

    it('should reject a language tag that is not well-formed', async() => {
      await expect(translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ; rml:predicateObjectMap [
  rml:predicate ex:name ; rml:objectMap [ rml:reference "name" ; rml:language "a-english" ] ] .`))
        .rejects.toThrow(`The RML language tag 'a-english' is not well-formed`);
    });
  });
});
