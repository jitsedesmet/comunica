import { RML_REFERENCE_FORMULATION_CSV } from '@comunica/bus-rml-reference-formulation';
import type { ComunicaDataFactory } from '@comunica/types';
import type { Algebra, AlgebraFactory } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import { resolve } from 'relative-to-absolute-iri';
import { RmlMappingGraph } from './RmlMappingGraph';
import { parseRmlTemplate } from './RmlTemplate';
import { RDF_TYPE, RML_NAMESPACE, RmlVocabulary } from './RmlVocabulary';

/**
 * The names of the functions that generate terms, next to the SPARQL operators.
 */
export const FUNCTION_INTERNAL_BLANK_NODE = 'internal://blank';
export const FUNCTION_RML_TO_IRI = 'internal://rml/to-iri';
export const FUNCTION_RML_ENCODE_FOR_IRI = 'internal://rml/encode-for-iri';

const IRI_TERM_TYPES: string[] = [ RmlVocabulary.IRI, RmlVocabulary.URI, RmlVocabulary.UnsafeIRI ];

/**
 * The term types that are allowed in each position of a quad, and for the datatype and language of a literal.
 */
type RmlTermPosition = 'subject' | 'predicate' | 'object' | 'graph' | 'datatype' | 'language';
const ALLOWED_TERM_TYPES: Record<RmlTermPosition, string[]> = {
  subject: [ ...IRI_TERM_TYPES, RmlVocabulary.BlankNode ],
  predicate: IRI_TERM_TYPES,
  object: [ ...IRI_TERM_TYPES, RmlVocabulary.BlankNode, RmlVocabulary.Literal ],
  graph: [ ...IRI_TERM_TYPES, RmlVocabulary.BlankNode ],
  datatype: IRI_TERM_TYPES,
  language: [ RmlVocabulary.Literal ],
};

const SUPPORTED_PROPERTIES: ReadonlySet<string> = new Set(Object.values(RmlVocabulary));
const WELL_FORMED_LANGUAGE_TAG = /^(?:[a-z]{2,8}|[ix])(?:-[a-z\d]{1,8})*$/iu;

/**
 * A map generating a value per record, or a constant term.
 */
type RmlExpressionMap = { constant: RDF.Term } | { reference: string } | { template: string };

/**
 * A map generating a term per record, or a constant term.
 */
type RmlTermMap = { constant: RDF.Term } | (({ reference: string } | { template: string }) & {
  termType: string;
  baseIRI: string;
  datatype?: RmlTermMap;
  language?: RmlTermMap;
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
  joinConditions: { child: RmlExpressionMap; parent: RmlExpressionMap }[];
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
   * @return The variable of the reference, which stays unbound for records without a value.
   */
  public getVariable(reference: string): RDF.Variable {
    let variable = this.references.find(entry => entry.reference === reference)?.variable;
    if (!variable) {
      variable = this.dataFactory.variable(`${this.variablePrefix}${this.references.length}`);
      this.references.push({ variable, reference });
    }
    return variable;
  }
}

export interface IRmlMappingToAlgebraTranslatorOptions {
  /**
   * The IRI to resolve generated relative IRIs against, unless a triples map defines its own.
   */
  baseIRI?: string;
  /**
   * The IRI to resolve relative source paths against, which are kept as is without it.
   */
  mappingDirectory?: string;
}

/**
 * Translates an RML mapping into an algebra operation that constructs the mapped quads.
 * It follows the translation of https://arxiv.org/abs/2503.10385, on top of the SPARQL algebra.
 */
export class RmlMappingToAlgebraTranslator {
  private readonly dataFactory: ComunicaDataFactory;
  private readonly algebraFactory: AlgebraFactory;
  private readonly options: IRmlMappingToAlgebraTranslatorOptions;
  private readonly quadVariables: Record<'subject' | 'predicate' | 'object' | 'graph', RDF.Variable>;

  /**
   * @param dataFactory The factory to create terms with.
   * @param algebraFactory The factory to create algebra operations with.
   * @param options The IRIs to resolve relative IRIs and paths against.
   */
  public constructor(
    dataFactory: ComunicaDataFactory,
    algebraFactory: AlgebraFactory,
    options: IRmlMappingToAlgebraTranslatorOptions,
  ) {
    this.dataFactory = dataFactory;
    this.algebraFactory = algebraFactory;
    this.options = options;
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
    const { subject, predicate, object, graph } = this.quadVariables;
    return this.algebraFactory.createConstruct(
      // An RDF dataset is a set, while the operations below give a bag
      this.algebraFactory.createDistinct(this.algebraFactory.createFilter(
        quadOperations.length > 0 ?
          this.algebraFactory.createUnion(quadOperations) :
          this.algebraFactory.createValues(quadVariables, []),
        // A term map generates no term for a record without the referenced values, which leaves its variable unbound
        this.createBoundExpression(quadVariables),
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
    const baseIRI = this.getBaseIri(mapping, triplesMap);
    const subjectMap = this.getSubjectMap(mapping, triplesMap);

    const quadMaps: [predicateMap: RmlTermMap, objectMap: RmlObjectMap, graphMaps: RmlTermMap[]][] = [
      ...subjectMap.classes.map<[RmlTermMap, RmlObjectMap, RmlTermMap[]]>(subjectClass =>
        [{ constant: this.dataFactory.namedNode(RDF_TYPE) }, { constant: subjectClass }, subjectMap.graphMaps ]),
      ...mapping.getObjects(triplesMap, RmlVocabulary.predicateObjectMap).flatMap((predicateObjectMap) => {
        const getTermMaps = (termMapProperty: string, constantProperty: string, position: RmlTermPosition):
        RmlTermMap[] => this
          .getTermMaps(mapping, predicateObjectMap, termMapProperty, constantProperty, position, baseIRI);
        const graphMaps = [
          ...subjectMap.graphMaps,
          ...getTermMaps(RmlVocabulary.graphMap, RmlVocabulary.graph, 'graph'),
        ];
        const objectMaps = this.getObjectMaps(mapping, predicateObjectMap, logicalSource, baseIRI);
        return getTermMaps(RmlVocabulary.predicateMap, RmlVocabulary.predicate, 'predicate')
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
    let operation: Algebra.Operation;
    if ('parentSubjectMap' in objectMap) {
      const parentReferences = new RmlLogicalSourceReferences(this.dataFactory, 'parentReference');
      objectExpression = this.createTermMapExpression(objectMap.parentSubjectMap, parentReferences);
      // The values of a join condition are equal, so both sources bind them to the same variable
      const joinVariables = objectMap.joinConditions
        .map((joinCondition, index) => this.dataFactory.variable(`joinValue${index}`));
      const childJoinValues = objectMap.joinConditions
        .map(({ child }) => this.createValueExpression(child, references));
      const parentJoinValues = objectMap.joinConditions
        .map(({ parent }) => this.createValueExpression(parent, parentReferences));
      operation = this.algebraFactory.createJoin([
        this.createJoinInput(
          this.createLogicalSourceOperation(logicalSource, references),
          joinVariables,
          childJoinValues,
        ),
        this.createJoinInput(
          this.createLogicalSourceOperation(objectMap.parentLogicalSource, parentReferences),
          joinVariables,
          parentJoinValues,
        ),
      ]);
    } else {
      objectExpression = this.createTermMapExpression(objectMap, references);
      operation = this.createLogicalSourceOperation(logicalSource, references);
    }

    const { subject, predicate, object, graph } = this.quadVariables;
    operation = this.algebraFactory.createExtend(operation, subject, subjectExpression);
    operation = this.algebraFactory.createExtend(operation, predicate, predicateExpression);
    operation = this.algebraFactory.createExtend(operation, object, objectExpression);
    operation = this.algebraFactory.createExtend(operation, graph, graphExpression);
    return this.algebraFactory.createProject(operation, [ subject, predicate, object, graph ]);
  }

  /**
   * Bind the values of the join conditions on one side of a join, and keep the records that have all of them.
   * @param input The operation of one side of the join.
   * @param joinVariables The variables to bind the values to, one per join condition.
   * @param joinValues The expressions generating the values, one per join condition.
   * @return The input of the join.
   */
  protected createJoinInput(
    input: Algebra.Operation,
    joinVariables: RDF.Variable[],
    joinValues: Algebra.Expression[],
  ): Algebra.Operation {
    if (joinVariables.length === 0) {
      return input;
    }
    for (const [ index, joinVariable ] of joinVariables.entries()) {
      input = this.algebraFactory.createExtend(input, joinVariable, joinValues[index]);
    }
    // A join would match anything on an unbound variable
    return this.algebraFactory.createFilter(input, this.createBoundExpression(joinVariables));
  }

  /**
   * Create the expression that tests if all given variables are bound.
   * @param variables The variables to test.
   * @return The conjunction of a BOUND expression per variable.
   */
  protected createBoundExpression(variables: RDF.Variable[]): Algebra.Expression {
    return variables
      .map(variable => this.algebraFactory
        .createOperatorExpression('bound', [ this.algebraFactory.createTermExpression(variable) ]))
      .reduce((left, right) => this.algebraFactory.createOperatorExpression('&&', [ left, right ]));
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
    const createNamedExpression = (functionName: string, args: Algebra.Expression[]): Algebra.Expression =>
      this.algebraFactory.createNamedExpression(this.dataFactory.namedNode(functionName), args);
    const baseIRI = this.algebraFactory.createTermExpression(this.dataFactory.literal(termMap.baseIRI));

    // Referenced values must not change the structure of a generated IRI
    const encodeForIri = (value: Algebra.Expression): Algebra.Expression =>
      createNamedExpression(FUNCTION_RML_ENCODE_FOR_IRI, [ value ]);
    const encodeForUri = (value: Algebra.Expression): Algebra.Expression =>
      this.algebraFactory.createOperatorExpression('encode_for_uri', [ value ]);

    switch (termMap.termType) {
      case RmlVocabulary.IRI:
        return createNamedExpression(
          FUNCTION_RML_TO_IRI,
          [ this.createValueExpression(termMap, references, encodeForIri), baseIRI ],
        );
      case RmlVocabulary.URI:
        return createNamedExpression(
          FUNCTION_RML_TO_IRI,
          [ this.createValueExpression(termMap, references, encodeForUri), baseIRI ],
        );
      case RmlVocabulary.UnsafeIRI:
        return this.algebraFactory.createOperatorExpression('iri', [ this.createValueExpression(termMap, references) ]);
      case RmlVocabulary.BlankNode:
        return createNamedExpression(FUNCTION_INTERNAL_BLANK_NODE, [ this.createValueExpression(termMap, references) ]);
      default:
        if (termMap.datatype) {
          return this.algebraFactory.createOperatorExpression('strdt', [
            this.createValueExpression(termMap, references),
            this.createTermMapExpression(termMap.datatype, references),
          ]);
        }
        if (termMap.language) {
          return this.algebraFactory.createOperatorExpression('strlang', [
            this.createValueExpression(termMap, references),
            this.createTermMapExpression(termMap.language, references),
          ]);
        }
        // A referenced value keeps the natural datatype of the data
        return 'reference' in termMap ?
          this.algebraFactory.createTermExpression(references.getVariable(termMap.reference)) :
          this.createValueExpression(termMap, references);
    }
  }

  /**
   * Create the expression generating the string value of an expression map.
   * @param expressionMap The expression map.
   * @param references The references of the logical source, to which the references of the map are added.
   * @param encodeTemplateValue Encodes a referenced value before it is inserted in a template.
   * @return An expression that errors if a referenced value is missing.
   */
  protected createValueExpression(
    expressionMap: RmlExpressionMap,
    references: RmlLogicalSourceReferences,
    encodeTemplateValue = (value: Algebra.Expression): Algebra.Expression => value,
  ): Algebra.Expression {
    if ('constant' in expressionMap) {
      return this.algebraFactory.createTermExpression(expressionMap.constant);
    }
    const createReferenceExpression = (reference: string): Algebra.Expression => this.algebraFactory
      .createOperatorExpression('str', [ this.algebraFactory.createTermExpression(references.getVariable(reference)) ]);
    if ('reference' in expressionMap) {
      return createReferenceExpression(expressionMap.reference);
    }
    const parts = parseRmlTemplate(expressionMap.template).map(part => 'text' in part ?
      this.algebraFactory.createTermExpression(this.dataFactory.literal(part.text)) :
      encodeTemplateValue(createReferenceExpression(part.reference)));
    return parts.length === 1 ? parts[0] : this.algebraFactory.createOperatorExpression('concat', parts);
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
    const { mappingDirectory } = this.options;
    const isRelativeToMapping = mappingDirectory !== undefined &&
      mapping.getOptionalObject(source, RmlVocabulary.root)?.value !== RmlVocabulary.CurrentWorkingDirectory;
    return {
      sourceUrl: isRelativeToMapping ? resolve(sourcePath, mappingDirectory) : sourcePath,
      referenceFormulation: mapping.getOptionalObject(logicalSource, RmlVocabulary.referenceFormulation)?.value ??
        RML_REFERENCE_FORMULATION_CSV,
      iterator: mapping.getOptionalObject(logicalSource, RmlVocabulary.iterator)?.value,
    };
  }

  /**
   * Read the IRI that the relative IRIs generated by a triples map are resolved against.
   * @param mapping The RML mapping.
   * @param triplesMap The triples map.
   * @return The base IRI of the triples map, or else of the translation, or else the empty string.
   */
  protected getBaseIri(mapping: RmlMappingGraph, triplesMap: RDF.Term): string {
    return mapping.getOptionalObject(triplesMap, RmlVocabulary.baseIRI)?.value ?? this.options.baseIRI ?? '';
  }

  /**
   * Read the subject map of a triples map, with its classes and graph maps.
   * @param mapping The RML mapping.
   * @param triplesMap The triples map.
   * @return The subject map.
   * @throws Error if the triples map does not have exactly one subject map.
   */
  protected getSubjectMap(mapping: RmlMappingGraph, triplesMap: RDF.Term): IRmlSubjectMap {
    const baseIRI = this.getBaseIri(mapping, triplesMap);
    const subjectMaps = mapping.getObjects(triplesMap, RmlVocabulary.subjectMap);
    const termMaps = this
      .getTermMaps(mapping, triplesMap, RmlVocabulary.subjectMap, RmlVocabulary.subject, 'subject', baseIRI);
    if (termMaps.length !== 1) {
      throw new Error(`Expected exactly one subject map on the RML triples map ${triplesMap.value}`);
    }
    return {
      termMap: termMaps[0],
      classes: subjectMaps.flatMap(subjectMap => mapping.getObjects(subjectMap, RmlVocabulary.class)),
      graphMaps: subjectMaps.flatMap(subjectMap => this
        .getTermMaps(mapping, subjectMap, RmlVocabulary.graphMap, RmlVocabulary.graph, 'graph', baseIRI)),
    };
  }

  /**
   * Read the object maps of a predicate-object map, including those that refer to a parent triples map.
   * @param mapping The RML mapping.
   * @param predicateObjectMap The predicate-object map.
   * @param logicalSource The logical source of the triples map that has the predicate-object map.
   * @param baseIRI The IRI that generated relative IRIs are resolved against.
   * @return The object maps.
   */
  protected getObjectMaps(
    mapping: RmlMappingGraph,
    predicateObjectMap: RDF.Term,
    logicalSource: IRmlLogicalSource,
    baseIRI: string,
  ): RmlObjectMap[] {
    return [
      ...mapping.getObjects(predicateObjectMap, RmlVocabulary.object)
        .map(constant => this.getConstantTermMap(constant, 'object')),
      ...mapping.getObjects(predicateObjectMap, RmlVocabulary.objectMap).map((objectMap) => {
        const parentTriplesMap = mapping.getOptionalObject(objectMap, RmlVocabulary.parentTriplesMap);
        if (!parentTriplesMap) {
          return this.getTermMap(mapping, objectMap, 'object', baseIRI);
        }
        const parentSubjectMap = this.getSubjectMap(mapping, parentTriplesMap).termMap;
        const joinConditions = mapping.getObjects(objectMap, RmlVocabulary.joinCondition).map(joinCondition => ({
          child: this.getJoinExpressionMap(mapping, joinCondition, RmlVocabulary.childMap, RmlVocabulary.child),
          parent: this.getJoinExpressionMap(mapping, joinCondition, RmlVocabulary.parentMap, RmlVocabulary.parent),
        }));
        const parentLogicalSource = this.getLogicalSource(mapping, parentTriplesMap);
        const isSameLogicalSource = parentLogicalSource.sourceUrl === logicalSource.sourceUrl &&
          parentLogicalSource.referenceFormulation === logicalSource.referenceFormulation &&
          parentLogicalSource.iterator === logicalSource.iterator;
        // Without join conditions on the same logical source, the parent subject map reads the same records
        return joinConditions.length === 0 && isSameLogicalSource ?
          parentSubjectMap :
            { parentLogicalSource, parentSubjectMap, joinConditions };
      }),
    ];
  }

  /**
   * Read the child or parent side of a join condition.
   * @param mapping The RML mapping.
   * @param joinCondition The join condition.
   * @param expressionMapProperty The IRI of the property that refers to an expression map.
   * @param referenceProperty The IRI of the shortcut property that refers to a reference.
   * @return The expression map generating the values to join on.
   */
  protected getJoinExpressionMap(
    mapping: RmlMappingGraph,
    joinCondition: RDF.Term,
    expressionMapProperty: string,
    referenceProperty: string,
  ): RmlExpressionMap {
    const expressionMap = mapping.getOptionalObject(joinCondition, expressionMapProperty);
    return expressionMap ?
      this.getExpressionMap(mapping, expressionMap) :
        { reference: mapping.getRequiredObject(joinCondition, referenceProperty).value };
  }

  /**
   * Read the term maps of a resource, including those written with the constant shortcut.
   * @param mapping The RML mapping.
   * @param resource The resource that has the term maps.
   * @param termMapProperty The IRI of the property that refers to a term map.
   * @param constantProperty The IRI of the shortcut property that refers to a constant term.
   * @param position The position of the terms that the term maps generate.
   * @param baseIRI The IRI that generated relative IRIs are resolved against.
   * @return The term maps.
   */
  protected getTermMaps(
    mapping: RmlMappingGraph,
    resource: RDF.Term,
    termMapProperty: string,
    constantProperty: string,
    position: RmlTermPosition,
    baseIRI: string,
  ): RmlTermMap[] {
    return [
      ...mapping.getObjects(resource, constantProperty).map(constant => this.getConstantTermMap(constant, position)),
      ...mapping.getObjects(resource, termMapProperty)
        .map(termMap => this.getTermMap(mapping, termMap, position, baseIRI)),
    ];
  }

  /**
   * Read a term map.
   * @param mapping The RML mapping.
   * @param termMap The term map.
   * @param position The position of the terms that the term map generates.
   * @param baseIRI The IRI that generated relative IRIs are resolved against.
   * @return The term map.
   * @throws Error if the term map has no constant, reference or template, or a term type its position does not allow.
   */
  protected getTermMap(
    mapping: RmlMappingGraph,
    termMap: RDF.Term,
    position: RmlTermPosition,
    baseIRI: string,
  ): RmlTermMap {
    const expressionMap = this.getExpressionMap(mapping, termMap);
    const declaredTermType = mapping.getOptionalObject(termMap, RmlVocabulary.termType)?.value;
    if ('constant' in expressionMap) {
      return this.getConstantTermMap(expressionMap.constant, position, declaredTermType);
    }

    const [ datatype ] = this
      .getTermMaps(mapping, termMap, RmlVocabulary.datatypeMap, RmlVocabulary.datatype, 'datatype', baseIRI);
    const [ language ] = this
      .getTermMaps(mapping, termMap, RmlVocabulary.languageMap, RmlVocabulary.language, 'language', baseIRI);
    // Objects are literals by default, unless they are templated
    const isLiteralByDefault = position === 'language' ||
      (position === 'object' && ('reference' in expressionMap || Boolean(datatype ?? language)));
    const termType = declaredTermType ?? (isLiteralByDefault ? RmlVocabulary.Literal : RmlVocabulary.IRI);
    if (!ALLOWED_TERM_TYPES[position].includes(termType)) {
      throw new Error(`The RML term type <${termType}> is not supported for a ${position}`);
    }
    return { ...expressionMap, termType, baseIRI, datatype, language };
  }

  /**
   * Create the term map of a constant term.
   * @param constant The constant term.
   * @param position The position of the term.
   * @param declaredTermType The IRI of the term type that the term map declares, if any.
   * @return The term map.
   * @throws Error if the constant is not allowed in its position, or does not have the declared term type.
   */
  protected getConstantTermMap(constant: RDF.Term, position: RmlTermPosition, declaredTermType?: string): RmlTermMap {
    const termTypes = constant.termType === 'NamedNode' ? IRI_TERM_TYPES : [ `${RML_NAMESPACE}${constant.termType}` ];
    if (!termTypes.some(termType => ALLOWED_TERM_TYPES[position].includes(termType)) ||
      (declaredTermType !== undefined && !termTypes.includes(declaredTermType))) {
      throw new Error(`The constant ${constant.termType} '${constant.value}' is not allowed as RML ${
        declaredTermType ? `<${declaredTermType}> ` : ''}${position}`);
    }
    if (position === 'language' && !WELL_FORMED_LANGUAGE_TAG.test(constant.value)) {
      throw new Error(`The RML language tag '${constant.value}' is not well-formed`);
    }
    return { constant };
  }

  /**
   * Read the constant, reference or template of an expression map.
   * @param mapping The RML mapping.
   * @param expressionMap The expression map.
   * @return The expression map.
   * @throws Error if the expression map has no constant, reference or template.
   */
  protected getExpressionMap(mapping: RmlMappingGraph, expressionMap: RDF.Term): RmlExpressionMap {
    const constant = mapping.getOptionalObject(expressionMap, RmlVocabulary.constant);
    if (constant) {
      return { constant };
    }
    const reference = mapping.getOptionalObject(expressionMap, RmlVocabulary.reference)?.value;
    if (reference !== undefined) {
      return { reference };
    }
    const template = mapping.getOptionalObject(expressionMap, RmlVocabulary.template)?.value;
    if (template === undefined) {
      throw new Error(`Expected a constant, reference or template on the RML map ${expressionMap.value}`);
    }
    return { template };
  }
}
