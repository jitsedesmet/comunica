import { ActorQueryParse } from '@comunica/bus-query-parse';
import { KeysInitQuery } from '@comunica/context-entries';
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
const operator = AF.createOperatorExpression.bind(AF);
const DEFAULT_GRAPH_EXPRESSION = term(DF.defaultGraph());
const SUBJECT_EXPRESSION = operator('iri', [ operator('concat', [
  literal('http://example.org/person/'),
  operator('encode_for_uri', [ variable('reference0') ]),
]) ]);

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
    return (<Algebra.Union> (<Algebra.Distinct> (<Algebra.Construct> operation).input).input).input
      .map(getQuadOperationParts);
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
        baseIRI: 'http://base.org/mapping.ttl',
        context,
      });

      expect(mediatorRdfParse.mediate).toHaveBeenCalledWith(expect.objectContaining({
        handle: expect.objectContaining({ metadata: { baseIRI: 'http://base.org/mapping.ttl' }}),
        handleMediaType: 'text/turtle',
      }));
      const quadVariables = [ 'subject', 'predicate', 'object', 'graph' ].map(name => DF.variable(name));
      let quadOperation: Algebra.Operation = AF.createRmlLogicalSource(
        'http://base.org/people.csv',
        'http://w3id.org/rml/CSV',
        [
          { variable: DF.variable('reference0'), reference: 'id', required: false },
          { variable: DF.variable('reference1'), reference: 'name', required: false },
        ],
      );
      quadOperation = AF.createExtend(quadOperation, quadVariables[0], SUBJECT_EXPRESSION);
      quadOperation = AF.createExtend(quadOperation, quadVariables[1], term(DF.namedNode('http://example.org/name')));
      quadOperation = AF.createExtend(quadOperation, quadVariables[2], variable('reference1'));
      quadOperation = AF.createExtend(quadOperation, quadVariables[3], DEFAULT_GRAPH_EXPRESSION);
      expect(operation).toEqual(AF.createConstruct(
        AF.createDistinct(AF.createUnion([ AF.createProject(quadOperation, quadVariables) ])),
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
        [{ variable: DF.variable('reference0'), reference: 'id', required: false }],
        '//p',
      ));
    });

    it('should translate every kind of term map', async() => {
      const quadOperations = await translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; rml:subject ex:subject ;
  rml:predicateObjectMap [
    rml:predicateMap [ rml:reference "property" ; rml:termType rml:IRI ] ;
    rml:object ex:shortcut ;
    rml:objectMap [ rml:constant "constant" ] ;
    rml:objectMap [ rml:reference "age" ; rml:datatype xsd:integer ] ;
    rml:objectMap [ rml:template "{name}" ; rml:language "en" ] ;
    rml:objectMap [ rml:template "{id} {name}" ; rml:termType rml:Literal ] ;
    rml:objectMap [ rml:template "address {id}" ; rml:termType rml:BlankNode ] ;
    rml:objectMap [ rml:template "http://example.org/static" ] ;
  ] .`);

      for (const { expressions, projectedVariables } of quadOperations) {
        expect(projectedVariables).toEqual([ 'subject', 'predicate', 'object', 'graph' ]);
        expect(expressions.subject).toEqual(term(DF.namedNode('http://example.org/subject')));
        expect(expressions.predicate).toEqual(operator('iri', [ variable('reference0') ]));
      }
      expect(quadOperations.map(({ expressions }) => expressions.object)).toEqual([
        term(DF.namedNode('http://example.org/shortcut')),
        literal('constant'),
        operator('strdt', [ variable('reference1'), term(DF.namedNode('http://www.w3.org/2001/XMLSchema#integer')) ]),
        operator('strlang', [ variable('reference1'), literal('en') ]),
        operator('concat', [ variable('reference1'), literal(' '), variable('reference2') ]),
        AF.createNamedExpression(
          DF.namedNode('internal://blank'),
          [ operator('concat', [ literal('address '), variable('reference1') ]) ],
        ),
        operator('iri', [ literal('http://example.org/static') ]),
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
        term(DF.namedNode('http://example.org/Person')),
        term(DF.namedNode('http://example.org/b')),
        term(DF.namedNode('http://example.org/b')),
        term(DF.namedNode('http://example.org/b')),
      ]);
      expect(quadOperations.map(({ expressions }) => expressions.graph)).toEqual([
        term(DF.namedNode('http://example.org/subjectGraph')),
        term(DF.namedNode('http://example.org/subjectGraph')),
        DEFAULT_GRAPH_EXPRESSION,
        operator('iri', [ operator('concat', [
          literal('http://example.org/graph/'),
          operator('encode_for_uri', [ variable('reference0') ]),
        ]) ]),
      ]);
      expect(quadOperations[0].expressions.predicate)
        .toEqual(term(DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')));
    });

    it('should join a parent triples map on its join conditions', async() => {
      const [{ expressions, input }] = await translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ;
  rml:predicateObjectMap [ rml:predicate ex:livesIn ; rml:objectMap [
    rml:parentTriplesMap ex:CityMap ;
    rml:joinCondition [ rml:child "city" ; rml:parent "name" ] ;
    rml:joinCondition [ rml:child "country" ; rml:parent "country" ] ;
  ] ] .
ex:CityMap rml:logicalSource [ rml:source "cities.csv" ] ;
  rml:subjectMap [ rml:template "http://example.org/{name}/{population}" ] .`);

      expect(input).toEqual(AF.createJoin([
        AF.createRmlLogicalSource('people.csv', 'http://w3id.org/rml/CSV', [
          { variable: DF.variable('reference0'), reference: 'id', required: false },
          { variable: DF.variable('reference1'), reference: 'city', required: true },
          { variable: DF.variable('reference2'), reference: 'country', required: true },
        ]),
        AF.createRmlLogicalSource('cities.csv', 'http://w3id.org/rml/CSV', [
          { variable: DF.variable('reference1'), reference: 'name', required: true },
          { variable: DF.variable('reference2'), reference: 'country', required: true },
          { variable: DF.variable('parentReference2'), reference: 'population', required: false },
        ]),
      ]));
      expect(expressions.subject).toEqual(SUBJECT_EXPRESSION);
      expect(expressions.object).toEqual(operator('iri', [ operator('concat', [
        literal('http://example.org/'),
        operator('encode_for_uri', [ variable('reference1') ]),
        literal('/'),
        operator('encode_for_uri', [ variable('parentReference2') ]),
      ]) ]));
    });

    it('should read a parent triples map without join conditions from the same logical source', async() => {
      const [{ expressions, input }] = await translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ;
  rml:predicateObjectMap [ rml:predicate ex:livesIn ; rml:objectMap [ rml:parentTriplesMap ex:CityMap ] ] .
ex:CityMap ${LOGICAL_SOURCE} ; rml:subjectMap [ rml:template "http://example.org/city/{city}" ] .`);

      expect(input).toEqual(AF.createRmlLogicalSource('people.csv', 'http://w3id.org/rml/CSV', [
        { variable: DF.variable('reference0'), reference: 'id', required: false },
        { variable: DF.variable('reference1'), reference: 'city', required: false },
      ]));
      expect(expressions.object).toEqual(operator('iri', [ operator('concat', [
        literal('http://example.org/city/'),
        operator('encode_for_uri', [ variable('reference1') ]),
      ]) ]));
    });

    it('should reject unsupported properties', async() => {
      await expect(translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ;
  rml:predicateObjectMap [ rml:predicate ex:a ; rml:objectMap [ rml:reference "a" ; rml:languageMap [] ] ] .`))
        .rejects.toThrow('The RML property <http://w3id.org/rml/languageMap> is not supported');
    });

    it('should reject a mapping without triples', async() => {
      await expect(translate('')).rejects.toThrow('The RML mapping does not generate any triples');
      await expect(translate(`ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} .`))
        .rejects.toThrow('The RML mapping does not generate any triples');
    });

    it('should reject a triples map without exactly one subject map', async() => {
      await expect(translate(`ex:PersonMap ${LOGICAL_SOURCE} .`))
        .rejects.toThrow('Expected exactly one subject map on the RML triples map http://example.org/PersonMap');
      await expect(translate(`ex:PersonMap ${LOGICAL_SOURCE} ; ${SUBJECT_MAP} ; rml:subject ex:a .`))
        .rejects.toThrow('Expected exactly one subject map on the RML triples map http://example.org/PersonMap');
    });

    it('should reject a term map without constant, reference or template', async() => {
      await expect(translate(`ex:PersonMap ${LOGICAL_SOURCE} ; rml:subjectMap ex:SubjectMap .`))
        .rejects.toThrow('Expected a constant, reference or template on the RML term map http://example.org/SubjectMap');
    });

    it('should reject an unsupported term type', async() => {
      await expect(translate(`
ex:PersonMap ${LOGICAL_SOURCE} ; rml:subjectMap [ rml:reference "id" ; rml:termType rml:UnsafeIRI ] .`))
        .rejects.toThrow('The RML term type <http://w3id.org/rml/UnsafeIRI> is not supported');
    });
  });
});
