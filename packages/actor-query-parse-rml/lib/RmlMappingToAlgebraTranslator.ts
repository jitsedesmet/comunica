import type { ComunicaDataFactory } from '@comunica/types';
import type { Algebra, AlgebraFactory } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import { resolve } from 'relative-to-absolute-iri';
import { RmlMappingGraph } from './RmlMappingGraph';
import { parseRmlTemplate } from './RmlTemplate';
import { RDF_TYPE, RML_NAMESPACE, RmlVocabulary } from './RmlVocabulary';

/**
 * The name of the function that gives the same blank node for the same argument.
 */
export const FUNCTION_INTERNAL_BLANK_NODE = 'internal://blank';

type RmlTermType = typeof RmlVocabulary.IRI | typeof RmlVocabulary.BlankNode | typeof RmlVocabulary.Literal;

/**
 * The term types that RDF allows in each position of a quad.
 */
const ALLOWED_TERM_TYPES: Record<'subject' | 'predicate' | 'object' | 'graph', string[]> = {
  subject: [ RmlVocabulary.IRI, RmlVocabulary.BlankNode ],
  predicate: [ RmlVocabulary.IRI ],
  object: [ RmlVocabulary.IRI, RmlVocabulary.BlankNode, RmlVocabulary.Literal ],
  graph: [ RmlVocabulary.IRI, RmlVocabulary.BlankNode ],
};
const SUPPORTED_PROPERTIES: ReadonlySet<string> = new Set(Object.values(RmlVocabulary));

/**
 * A term map generating a term per record, or a constant term.
 */
type RmlTermMap = { constant: RDF.Term } | (({ reference: string } | { template: string }) & {
  termType: RmlTermType;
  datatype?: RDF.Term;
  language?: RDF.Term;
});

interface IRmlLogicalSource {
  sourceUrl: string;
  referenceFormulation: string;
  iterator?: string;
}

interface IRmlSubjectMap {
  termMap: RmlTermMap;
  classes: RDF.Term[];
  graphMaps: RmlTermMap[];
}

/**
 * An object map that takes the subjects of another triples map as objects, for the records that join.
 */
interface IRmlReferencingObjectMap {
  parentLogicalSource: IRmlLogicalSource;
  parentSubjectMap: RmlTermMap;
  joinConditions: { child: string; parent: string }[];
}

type RmlObjectMap = RmlTermMap | IRmlReferencingObjectMap;

/**
 * The references to read from a logical source, each bound to a variable of its own.
 */
class RmlLogicalSourceReferences {
  public readonly references: Algebra.RmlLogicalSourceReference[] = [];

  /**
   * @param dataFactory The factory to create variables with.
   * @param variablePrefix The prefix of the variable names, which differs between the sources of a join.
   */
  public constructor(
    private readonly dataFactory: ComunicaDataFactory,
    private readonly variablePrefix: string,
  ) {}

  /**
   * Get the variable that the values of a reference are bound to.
   * @param reference The reference to read.
   * @return The variable of the reference, which stays unbound for records without a value unless it is required.
   */
  public getVariable(reference: string): RDF.Variable {
    return this.references.find(entry => entry.reference === reference)?.variable ??
      this.bind(this.dataFactory.variable(`${this.variablePrefix}${this.references.length}`), reference, false);
  }

  /**
   * Bind the values of a reference to a new variable, skipping the records without a value.
   * @param reference The reference to read.
   * @return The variable of the reference.
   */
  public getRequiredVariable(reference: string): RDF.Variable {
    return this.bind(this.dataFactory.variable(`${this.variablePrefix}${this.references.length}`), reference, true);
  }

  /**
   * Bind the values of a reference to a given variable.
   * @param variable The variable to bind.
   * @param reference The reference to read.
   * @param required If records without a value are skipped.
   * @return The given variable.
   */
  public bind(variable: RDF.Variable, reference: string, required: boolean): RDF.Variable {
    this.references.push({ variable, reference, required });
    return variable;
  }
}

/**
 * Translates an RML mapping into an algebra operation that constructs the mapped quads.
 * It follows the translation of https://arxiv.org/abs/2503.10385, on top of the SPARQL algebra.
 */
export class RmlMappingToAlgebraTranslator {
  private readonly dataFactory: ComunicaDataFactory;
  private readonly algebraFactory: AlgebraFactory;
  private readonly baseIRI: string | undefined;
  private readonly quadVariables: Record<'subject' | 'predicate' | 'object' | 'graph', RDF.Variable>;

  /**
   * @param dataFactory The factory to create terms with.
   * @param algebraFactory The factory to create algebra operations with.
   * @param baseIRI The IRI to resolve relative source paths against, which are kept as is without it.
   */
  public constructor(dataFactory: ComunicaDataFactory, algebraFactory: AlgebraFactory, baseIRI?: string) {
    this.dataFactory = dataFactory;
    this.algebraFactory = algebraFactory;
    this.baseIRI = baseIRI;
    this.quadVariables = {
      subject: dataFactory.variable('subject'),
      predicate: dataFactory.variable('predicate'),
      object: dataFactory.variable('object'),
      graph: dataFactory.variable('graph'),
    };
  }

  /**
   * Translate an RML mapping.
   * @param mappingQuads The quads of the RML mapping.
   * @return A construct operation that gives the quads the mapping generates.
   * @throws Error if the mapping is invalid, or uses a feature that is not supported.
   */
  public translate(mappingQuads: RDF.Quad[]): Algebra.Construct {
    const unsupported = mappingQuads.find(({ predicate }) =>
      predicate.value.startsWith(RML_NAMESPACE) && !SUPPORTED_PROPERTIES.has(predicate.value));
    if (unsupported) {
      throw new Error(`The RML property <${unsupported.predicate.value}> is not supported`);
    }

    const mapping = new RmlMappingGraph(mappingQuads);
    const triplesMaps = mapping.getSubjects(RmlVocabulary.logicalSource);
    if (triplesMaps.length === 0) {
      throw new Error(`The RML mapping has no triples map with a <${RmlVocabulary.logicalSource}>`);
    }
    const quadOperations = triplesMaps.flatMap(triplesMap => this.translateTriplesMap(mapping, triplesMap));

    const quadVariables = Object.values(this.quadVariables);
    // A term map generates no term for a record without the referenced values, which leaves its variable unbound
    const isQuadBound = quadVariables
      .map(variable => this.algebraFactory
        .createOperatorExpression('bound', [ this.algebraFactory.createTermExpression(variable) ]))
      .reduce((left, right) => this.algebraFactory.createOperatorExpression('&&', [ left, right ]));
    const { subject, predicate, object, graph } = this.quadVariables;
    return this.algebraFactory.createConstruct(
      // An RDF dataset is a set, while the operations below give a bag
      this.algebraFactory.createDistinct(this.algebraFactory.createFilter(
        quadOperations.length > 0 ?
          this.algebraFactory.createUnion(quadOperations) :
          this.algebraFactory.createValues(quadVariables, []),
        isQuadBound,
      )),
      [ this.algebraFactory.createPattern(subject, predicate, object, graph) ],
    );
  }

  /**
   * Translate a triples map into one operation per combination of its predicate, object and graph maps.
   * @param mapping The RML mapping.
   * @param triplesMap The triples map to translate.
   * @return The operations, each binding the variables of the quads it generates.
   */
  protected translateTriplesMap(mapping: RmlMappingGraph, triplesMap: RDF.Term): Algebra.Operation[] {
    const logicalSource = this.getLogicalSource(mapping, triplesMap);
    const subjectMap = this.getSubjectMap(mapping, triplesMap);

    const quadMaps: [predicateMap: RmlTermMap, objectMap: RmlObjectMap, graphMaps: RmlTermMap[]][] = [
      ...subjectMap.classes.map<[RmlTermMap, RmlObjectMap, RmlTermMap[]]>(subjectClass =>
        [{ constant: this.dataFactory.namedNode(RDF_TYPE) }, { constant: subjectClass }, subjectMap.graphMaps ]),
      ...mapping.getObjects(triplesMap, RmlVocabulary.predicateObjectMap).flatMap((predicateObjectMap) => {
        const graphMaps = [
          ...subjectMap.graphMaps,
          ...this.getTermMaps(mapping, predicateObjectMap, RmlVocabulary.graphMap, RmlVocabulary.graph, 'graph'),
        ];
        const objectMaps = this.getObjectMaps(mapping, predicateObjectMap, logicalSource);
        return this
          .getTermMaps(mapping, predicateObjectMap, RmlVocabulary.predicateMap, RmlVocabulary.predicate, 'predicate')
          .flatMap(predicateMap => objectMaps
            .map<[RmlTermMap, RmlObjectMap, RmlTermMap[]]>(objectMap => [ predicateMap, objectMap, graphMaps ]));
      }),
    ];
    // Without graph maps, the quads are generated in the default graph
    return quadMaps.flatMap(([ predicateMap, objectMap, graphMaps ]) =>
      (graphMaps.length > 0 ? graphMaps : [ undefined ]).map(graphMap =>
        this.createQuadOperation(logicalSource, subjectMap.termMap, predicateMap, objectMap, graphMap)));
  }

  /**
   * Create the operation generating the quads of a single subject, predicate, object and graph map.
   * @param logicalSource The logical source of the triples map.
   * @param subjectMap The map generating the subjects.
   * @param predicateMap The map generating the predicates.
   * @param objectMap The map generating the objects.
   * @param graphMap The map generating the graphs, or undefined for the default graph.
   * @return A project operation over the variables of the generated quads.
   */
  protected createQuadOperation(
    logicalSource: IRmlLogicalSource,
    subjectMap: RmlTermMap,
    predicateMap: RmlTermMap,
    objectMap: RmlObjectMap,
    graphMap: RmlTermMap | undefined,
  ): Algebra.Operation {
    // Creating the expressions collects the references to read from the logical sources
    const references = new RmlLogicalSourceReferences(this.dataFactory, 'reference');
    const subjectExpression = this.createTermMapExpression(subjectMap, references);
    const predicateExpression = this.createTermMapExpression(predicateMap, references);
    const isDefaultGraph = !graphMap ||
      ('constant' in graphMap && graphMap.constant.value === RmlVocabulary.defaultGraph);
    const graphExpression = isDefaultGraph ?
      this.algebraFactory.createTermExpression(this.dataFactory.defaultGraph()) :
      this.createTermMapExpression(graphMap, references);

    let objectExpression: Algebra.Expression;
    let parentOperation: Algebra.Operation | undefined;
    if ('parentSubjectMap' in objectMap) {
      // The values of a join condition are equal, so both sources bind them to the same variable
      const parentReferences = new RmlLogicalSourceReferences(this.dataFactory, 'parentReference');
      for (const { child, parent } of objectMap.joinConditions) {
        parentReferences.bind(references.getRequiredVariable(child), parent, true);
      }
      objectExpression = this.createTermMapExpression(objectMap.parentSubjectMap, parentReferences);
      parentOperation = this.createLogicalSourceOperation(objectMap.parentLogicalSource, parentReferences);
    } else {
      objectExpression = this.createTermMapExpression(objectMap, references);
    }

    let operation: Algebra.Operation = this.createLogicalSourceOperation(logicalSource, references);
    if (parentOperation) {
      operation = this.algebraFactory.createJoin([ operation, parentOperation ]);
    }
    const { subject, predicate, object, graph } = this.quadVariables;
    operation = this.algebraFactory.createExtend(operation, subject, subjectExpression);
    operation = this.algebraFactory.createExtend(operation, predicate, predicateExpression);
    operation = this.algebraFactory.createExtend(operation, object, objectExpression);
    operation = this.algebraFactory.createExtend(operation, graph, graphExpression);
    return this.algebraFactory.createProject(operation, [ subject, predicate, object, graph ]);
  }

  /**
   * Create the expression generating the term of a term map.
   * @param termMap The term map.
   * @param references The references of the logical source, to which the references of the term map are added.
   * @return An expression that errors if a referenced value is missing, so that no term is generated.
   */
  protected createTermMapExpression(termMap: RmlTermMap, references: RmlLogicalSourceReferences): Algebra.Expression {
    if ('constant' in termMap) {
      return this.algebraFactory.createTermExpression(termMap.constant);
    }

    const createReferenceExpression = (reference: string): Algebra.Expression =>
      this.algebraFactory.createTermExpression(references.getVariable(reference));
    let value: Algebra.Expression;
    if ('reference' in termMap) {
      value = createReferenceExpression(termMap.reference);
    } else {
      const parts = parseRmlTemplate(termMap.template).map((part) => {
        if ('text' in part) {
          return this.algebraFactory.createTermExpression(this.dataFactory.literal(part.text));
        }
        // Referenced values must not change the structure of a generated IRI
        const referenceExpression = createReferenceExpression(part.reference);
        return termMap.termType === RmlVocabulary.IRI ?
          this.algebraFactory.createOperatorExpression('encode_for_uri', [ referenceExpression ]) :
          referenceExpression;
      });
      value = parts.length === 1 ? parts[0] : this.algebraFactory.createOperatorExpression('concat', parts);
    }

    switch (termMap.termType) {
      case RmlVocabulary.IRI:
        return this.algebraFactory.createOperatorExpression('iri', [ value ]);
      case RmlVocabulary.BlankNode:
        return this.algebraFactory
          .createNamedExpression(this.dataFactory.namedNode(FUNCTION_INTERNAL_BLANK_NODE), [ value ]);
      case RmlVocabulary.Literal:
        if (termMap.datatype) {
          return this.algebraFactory
            .createOperatorExpression('strdt', [ value, this.algebraFactory.createTermExpression(termMap.datatype) ]);
        }
        if (termMap.language) {
          return this.algebraFactory
            .createOperatorExpression('strlang', [ value, this.algebraFactory.createTermExpression(termMap.language) ]);
        }
        return value;
    }
  }

  /**
   * Create the operation reading references from a logical source.
   * @param logicalSource The logical source to read.
   * @param references The references to read, and the variables to bind their values to.
   * @return The RML logical source operation.
   */
  protected createLogicalSourceOperation(
    logicalSource: IRmlLogicalSource,
    references: RmlLogicalSourceReferences,
  ): Algebra.RmlLogicalSource {
    return this.algebraFactory.createRmlLogicalSource(
      logicalSource.sourceUrl,
      logicalSource.referenceFormulation,
      references.references,
      logicalSource.iterator,
    );
  }

  /**
   * Read the logical source of a triples map.
   * @param mapping The RML mapping.
   * @param triplesMap The triples map.
   * @return The logical source, with CSV as default reference formulation.
   */
  protected getLogicalSource(mapping: RmlMappingGraph, triplesMap: RDF.Term): IRmlLogicalSource {
    const logicalSource = mapping.getRequiredObject(triplesMap, RmlVocabulary.logicalSource);
    const source = mapping.getRequiredObject(logicalSource, RmlVocabulary.source);
    const sourcePath = source.termType === 'Literal' ?
      source.value :
      mapping.getRequiredObject(source, RmlVocabulary.path).value;
    return {
      sourceUrl: this.baseIRI ? resolve(sourcePath, this.baseIRI) : sourcePath,
      referenceFormulation: mapping.getOptionalObject(logicalSource, RmlVocabulary.referenceFormulation)?.value ??
        RmlVocabulary.CSV,
      iterator: mapping.getOptionalObject(logicalSource, RmlVocabulary.iterator)?.value,
    };
  }

  /**
   * Read the subject map of a triples map, with its classes and graph maps.
   * @param mapping The RML mapping.
   * @param triplesMap The triples map.
   * @return The subject map.
   * @throws Error if the triples map does not have exactly one subject map.
   */
  protected getSubjectMap(mapping: RmlMappingGraph, triplesMap: RDF.Term): IRmlSubjectMap {
    const constants = mapping.getObjects(triplesMap, RmlVocabulary.subject);
    const subjectMaps = mapping.getObjects(triplesMap, RmlVocabulary.subjectMap);
    if (constants.length + subjectMaps.length !== 1) {
      throw new Error(`Expected exactly one subject map on the RML triples map ${triplesMap.value}`);
    }
    if (constants.length === 1) {
      return { termMap: { constant: constants[0] }, classes: [], graphMaps: []};
    }
    return {
      termMap: this.getTermMap(mapping, subjectMaps[0], 'subject'),
      classes: mapping.getObjects(subjectMaps[0], RmlVocabulary.class),
      graphMaps: this.getTermMaps(mapping, subjectMaps[0], RmlVocabulary.graphMap, RmlVocabulary.graph, 'graph'),
    };
  }

  /**
   * Read the object maps of a predicate-object map, including those that refer to a parent triples map.
   * @param mapping The RML mapping.
   * @param predicateObjectMap The predicate-object map.
   * @param logicalSource The logical source of the triples map that has the predicate-object map.
   * @return The object maps.
   */
  protected getObjectMaps(
    mapping: RmlMappingGraph,
    predicateObjectMap: RDF.Term,
    logicalSource: IRmlLogicalSource,
  ): RmlObjectMap[] {
    return [
      ...mapping.getObjects(predicateObjectMap, RmlVocabulary.object).map(constant => ({ constant })),
      ...mapping.getObjects(predicateObjectMap, RmlVocabulary.objectMap).map((objectMap) => {
        const parentTriplesMap = mapping.getOptionalObject(objectMap, RmlVocabulary.parentTriplesMap);
        if (!parentTriplesMap) {
          return this.getTermMap(mapping, objectMap, 'object');
        }
        const parentSubjectMap = this.getSubjectMap(mapping, parentTriplesMap).termMap;
        const joinConditions = mapping.getObjects(objectMap, RmlVocabulary.joinCondition).map(joinCondition => ({
          child: mapping.getRequiredObject(joinCondition, RmlVocabulary.child).value,
          parent: mapping.getRequiredObject(joinCondition, RmlVocabulary.parent).value,
        }));
        const parentLogicalSource = this.getLogicalSource(mapping, parentTriplesMap);
        // Without join conditions on the same logical source, the parent subject map reads the same records
        const isSameLogicalSource = parentLogicalSource.sourceUrl === logicalSource.sourceUrl &&
          parentLogicalSource.referenceFormulation === logicalSource.referenceFormulation &&
          parentLogicalSource.iterator === logicalSource.iterator;
        return joinConditions.length === 0 && isSameLogicalSource ?
          parentSubjectMap :
            { parentLogicalSource, parentSubjectMap, joinConditions };
      }),
    ];
  }

  /**
   * Read the term maps of a resource, including those written with the constant shortcut.
   * @param mapping The RML mapping.
   * @param resource The resource that has the term maps.
   * @param termMapProperty The IRI of the property that refers to a term map.
   * @param constantProperty The IRI of the shortcut property that refers to a constant term.
   * @param position The position in a quad of the terms that the term maps generate.
   * @return The term maps.
   */
  protected getTermMaps(
    mapping: RmlMappingGraph,
    resource: RDF.Term,
    termMapProperty: string,
    constantProperty: string,
    position: keyof typeof ALLOWED_TERM_TYPES,
  ): RmlTermMap[] {
    return [
      ...mapping.getObjects(resource, constantProperty).map(constant => ({ constant })),
      ...mapping.getObjects(resource, termMapProperty).map(termMap => this.getTermMap(mapping, termMap, position)),
    ];
  }

  /**
   * Read a term map.
   * @param mapping The RML mapping.
   * @param termMap The term map.
   * @param position The position in a quad of the terms that the term map generates.
   * @return The term map.
   * @throws Error if the term map has no constant, reference or template, or a term type its position does not allow.
   */
  protected getTermMap(
    mapping: RmlMappingGraph,
    termMap: RDF.Term,
    position: keyof typeof ALLOWED_TERM_TYPES,
  ): RmlTermMap {
    const constant = mapping.getOptionalObject(termMap, RmlVocabulary.constant);
    if (constant) {
      return { constant };
    }

    const reference = mapping.getOptionalObject(termMap, RmlVocabulary.reference)?.value;
    const template = mapping.getOptionalObject(termMap, RmlVocabulary.template)?.value;
    if (reference === undefined && template === undefined) {
      throw new Error(`Expected a constant, reference or template on the RML term map ${termMap.value}`);
    }
    const generator = reference === undefined ? { template: template! } : { reference };

    const datatype = mapping.getOptionalObject(termMap, RmlVocabulary.datatype);
    const language = mapping.getOptionalObject(termMap, RmlVocabulary.language);
    // Objects are literals by default, unless they are templated
    const isLiteralByDefault = position === 'object' && (reference !== undefined || Boolean(datatype ?? language));
    const defaultTermType = isLiteralByDefault ?
      RmlVocabulary.Literal :
      RmlVocabulary.IRI;
    const termType = mapping.getOptionalObject(termMap, RmlVocabulary.termType)?.value ?? defaultTermType;
    if (!ALLOWED_TERM_TYPES[position].includes(termType)) {
      throw new Error(`The RML term type <${termType}> is not supported for a ${position}`);
    }
    return { ...generator, termType: <RmlTermType> termType, datatype, language };
  }
}
