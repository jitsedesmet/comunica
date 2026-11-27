import type { ComunicaDataFactory } from '@comunica/types';
import type { Algebra, AlgebraFactory } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import { resolve } from 'relative-to-absolute-iri';
import { RmlMappingGraph } from './RmlMappingGraph';
import { parseRmlTemplate } from './RmlTemplate';
import { RDF_TYPE, RML_UNSUPPORTED_PROPERTIES, RmlVocabulary } from './RmlVocabulary';

/**
 * The name of the function that gives the same blank node for the same argument.
 */
export const FUNCTION_INTERNAL_BLANK_NODE = 'internal://blank';

type RmlTermType = typeof RmlVocabulary.IRI | typeof RmlVocabulary.BlankNode | typeof RmlVocabulary.Literal;

/**
 * A term map generating a term per record, or a constant term.
 */
type RmlTermMap = { constant: RDF.Term } | {
  /**
   * Either a reference or a template is defined.
   */
  reference?: string;
  template?: string;
  termType: RmlTermType;
  datatype?: RDF.Term;
  language?: RDF.Term;
};

interface IRmlLogicalSource {
  sourceUrl: string;
  referenceFormulation: string;
  iterator?: string;
}

interface IRmlJoinCondition {
  child: string;
  parent: string;
}

/**
 * An object map that takes the subjects of another triples map as objects.
 */
interface IRmlReferencingObjectMap {
  parentLogicalSource: IRmlLogicalSource;
  parentSubjectMap: RmlTermMap;
  joinConditions: IRmlJoinCondition[];
}

/**
 * The variables holding the terms of the generated quads.
 */
interface IRmlQuadVariables {
  subject: RDF.Variable;
  predicate: RDF.Variable;
  object: RDF.Variable;
  graph?: RDF.Variable;
}

/**
 * Translates an RML mapping into an algebra operation that constructs the mapped quads.
 * It follows the translation of https://arxiv.org/abs/2503.10385, on top of the SPARQL algebra.
 */
export class RmlMappingToAlgebraTranslator {
  private readonly dataFactory: ComunicaDataFactory;
  private readonly algebraFactory: AlgebraFactory;
  private readonly baseIRI: string | undefined;
  private readonly defaultGraphVariables: IRmlQuadVariables;
  private readonly namedGraphVariables: Required<IRmlQuadVariables>;

  /**
   * @param dataFactory The factory to create terms with.
   * @param algebraFactory The factory to create algebra operations with.
   * @param baseIRI The IRI to resolve relative source paths against, which are kept as is without it.
   */
  public constructor(dataFactory: ComunicaDataFactory, algebraFactory: AlgebraFactory, baseIRI?: string) {
    this.dataFactory = dataFactory;
    this.algebraFactory = algebraFactory;
    this.baseIRI = baseIRI;
    // A quad in the default graph has no graph term to bind, so it gets variables of its own.
    this.defaultGraphVariables = {
      subject: dataFactory.variable('subject'),
      predicate: dataFactory.variable('predicate'),
      object: dataFactory.variable('object'),
    };
    this.namedGraphVariables = {
      subject: dataFactory.variable('namedGraphSubject'),
      predicate: dataFactory.variable('namedGraphPredicate'),
      object: dataFactory.variable('namedGraphObject'),
      graph: dataFactory.variable('namedGraph'),
    };
  }

  /**
   * Translate an RML mapping.
   * @param mappingQuads The quads of the RML mapping.
   * @return A construct operation that gives the quads the mapping generates.
   * @throws Error if the mapping is invalid, or uses a feature that is not supported.
   */
  public translate(mappingQuads: RDF.Quad[]): Algebra.Construct {
    const unsupported = mappingQuads.find(quad => RML_UNSUPPORTED_PROPERTIES.has(quad.predicate.value));
    if (unsupported) {
      throw new Error(`The RML property <${unsupported.predicate.value}> is not supported`);
    }

    const mapping = new RmlMappingGraph(mappingQuads);
    const quadOperations = mapping.getSubjects(RmlVocabulary.logicalSource)
      .flatMap(triplesMap => this.translateTriplesMap(mapping, triplesMap));
    if (quadOperations.length === 0) {
      throw new Error('The RML mapping does not generate any triples');
    }

    const { defaultGraphVariables, namedGraphVariables } = this;
    return this.algebraFactory.createConstruct(
      // An RDF dataset is a set, while the operations below give a bag
      this.algebraFactory.createDistinct(this.algebraFactory.createUnion(quadOperations)),
      [
        this.algebraFactory.createPattern(
          defaultGraphVariables.subject,
          defaultGraphVariables.predicate,
          defaultGraphVariables.object,
        ),
        this.algebraFactory.createPattern(
          namedGraphVariables.subject,
          namedGraphVariables.predicate,
          namedGraphVariables.object,
          namedGraphVariables.graph,
        ),
      ],
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
    const subjectMapNode = mapping.getOptionalObject(triplesMap, RmlVocabulary.subjectMap);
    const subjectGraphMaps = subjectMapNode ?
      this.getTermMaps(mapping, subjectMapNode, RmlVocabulary.graphMap, RmlVocabulary.graph) :
        [];

    const quadOperations: Algebra.Operation[] = [];
    const addQuadOperations = (
      predicateMap: RmlTermMap,
      objectMap: RmlTermMap | IRmlReferencingObjectMap,
      graphMaps: RmlTermMap[],
    ): void => {
      for (const graphMap of graphMaps.length > 0 ? graphMaps : [ undefined ]) {
        quadOperations
          .push(this.createQuadOperation(logicalSource, subjectMap, predicateMap, objectMap, graphMap));
      }
    };

    if (subjectMapNode) {
      for (const subjectClass of mapping.getObjects(subjectMapNode, RmlVocabulary.class)) {
        addQuadOperations(
          { constant: this.dataFactory.namedNode(RDF_TYPE) },
          { constant: subjectClass },
          subjectGraphMaps,
        );
      }
    }
    for (const predicateObjectMap of mapping.getObjects(triplesMap, RmlVocabulary.predicateObjectMap)) {
      const graphMaps = [
        ...subjectGraphMaps,
        ...this.getTermMaps(mapping, predicateObjectMap, RmlVocabulary.graphMap, RmlVocabulary.graph),
      ];
      const objectMaps = this.getObjectMaps(mapping, predicateObjectMap);
      for (const predicateMap of
        this.getTermMaps(mapping, predicateObjectMap, RmlVocabulary.predicateMap, RmlVocabulary.predicate)) {
        for (const objectMap of objectMaps) {
          addQuadOperations(predicateMap, objectMap, graphMaps);
        }
      }
    }
    return quadOperations;
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
    objectMap: RmlTermMap | IRmlReferencingObjectMap,
    graphMap: RmlTermMap | undefined,
  ): Algebra.Operation {
    const isDefaultGraph = !graphMap ||
      ('constant' in graphMap && graphMap.constant.value === RmlVocabulary.defaultGraph);
    const quadVariables = isDefaultGraph ? this.defaultGraphVariables : this.namedGraphVariables;

    // Creating the expressions collects the references to read from the logical sources
    const references: Algebra.RmlLogicalSourceReference[] = [];
    const parentReferences: Algebra.RmlLogicalSourceReference[] = [];
    const joinVariables: RDF.Variable[] = [];
    let referenceVariableCounter = 0;
    const createReferenceVariable = (): RDF.Variable =>
      this.dataFactory.variable(`reference${referenceVariableCounter++}`);
    const createExpression = (termMap: RmlTermMap, termMapReferences = references): Algebra.Expression =>
      this.createTermMapExpression(termMap, termMapReferences, createReferenceVariable);
    const extensions: [RDF.Variable, Algebra.Expression][] = [
      [ quadVariables.subject, createExpression(subjectMap) ],
      [ quadVariables.predicate, createExpression(predicateMap) ],
    ];
    if ('parentSubjectMap' in objectMap) {
      // The values of a join condition are equal, so both sources bind them to the same variable
      for (const { child, parent } of objectMap.joinConditions) {
        const joinVariable = createReferenceVariable();
        joinVariables.push(joinVariable);
        references.push({ variable: joinVariable, reference: child });
        parentReferences.push({ variable: joinVariable, reference: parent });
      }
      // Without join conditions, the parent triples map reads the records of this logical source
      extensions.push([ quadVariables.object, createExpression(
        objectMap.parentSubjectMap,
        joinVariables.length > 0 ? parentReferences : references,
      ) ]);
    } else {
      extensions.push([ quadVariables.object, createExpression(objectMap) ]);
    }
    if (!isDefaultGraph) {
      extensions.push([ quadVariables.graph!, createExpression(graphMap) ]);
    }

    let operation: Algebra.Operation = this.createLogicalSourceOperation(logicalSource, references);
    if ('parentSubjectMap' in objectMap && joinVariables.length > 0) {
      operation = this.algebraFactory.createJoin([
        this.createBoundFilter(operation, joinVariables),
        this.createBoundFilter(
          this.createLogicalSourceOperation(objectMap.parentLogicalSource, parentReferences),
          joinVariables,
        ),
      ]);
    }
    for (const [ variable, expression ] of extensions) {
      operation = this.algebraFactory.createExtend(operation, variable, expression);
    }
    return this.algebraFactory.createProject(operation, Object.values(quadVariables));
  }

  /**
   * Create the expression generating the term of a term map.
   * @param termMap The term map.
   * @param references The references of the logical source, to which the references of the term map are added.
   * @param createReferenceVariable Creates a variable that no other reference is bound to.
   * @return An expression that errors if a referenced value is missing, so that no term is generated.
   */
  protected createTermMapExpression(
    termMap: RmlTermMap,
    references: Algebra.RmlLogicalSourceReference[],
    createReferenceVariable: () => RDF.Variable,
  ): Algebra.Expression {
    if ('constant' in termMap) {
      return this.algebraFactory.createTermExpression(termMap.constant);
    }

    const getReferenceExpression = (reference: string): Algebra.Expression => {
      let variable = references.find(entry => entry.reference === reference)?.variable;
      if (!variable) {
        variable = createReferenceVariable();
        references.push({ variable, reference });
      }
      return this.algebraFactory.createTermExpression(variable);
    };

    let value: Algebra.Expression;
    if (termMap.reference === undefined) {
      const parts = parseRmlTemplate(termMap.template!).map((part) => {
        if ('text' in part) {
          return this.algebraFactory.createTermExpression(this.dataFactory.literal(part.text));
        }
        // Referenced values must not change the structure of a generated IRI
        return termMap.termType === RmlVocabulary.IRI ?
          this.algebraFactory.createOperatorExpression('encode_for_uri', [ getReferenceExpression(part.reference) ]) :
          getReferenceExpression(part.reference);
      });
      value = parts.length === 1 ? parts[0] : this.algebraFactory.createOperatorExpression('concat', parts);
    } else {
      value = getReferenceExpression(termMap.reference);
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
    references: Algebra.RmlLogicalSourceReference[],
  ): Algebra.RmlLogicalSource {
    return this.algebraFactory.createRmlLogicalSource(
      logicalSource.sourceUrl,
      logicalSource.referenceFormulation,
      references,
      logicalSource.iterator,
    );
  }

  /**
   * Keep only the solutions that bind all given variables, as a join would match anything on an unbound variable.
   * @param input The operation to filter.
   * @param variables The variables that must be bound.
   * @return The filtered operation.
   */
  protected createBoundFilter(input: Algebra.Operation, variables: RDF.Variable[]): Algebra.Operation {
    return this.algebraFactory.createFilter(input, variables
      .map(variable => this.algebraFactory
        .createOperatorExpression('bound', [ this.algebraFactory.createTermExpression(variable) ]))
      .reduce((left, right) => this.algebraFactory.createOperatorExpression('&&', [ left, right ])));
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
   * Read the subject map of a triples map.
   * @param mapping The RML mapping.
   * @param triplesMap The triples map.
   * @return The subject map.
   * @throws Error if the triples map does not have exactly one subject map.
   */
  protected getSubjectMap(mapping: RmlMappingGraph, triplesMap: RDF.Term): RmlTermMap {
    const subjectMaps = this.getTermMaps(mapping, triplesMap, RmlVocabulary.subjectMap, RmlVocabulary.subject);
    if (subjectMaps.length !== 1) {
      throw new Error(`Expected exactly one subject map on the RML triples map ${triplesMap.value}`);
    }
    return subjectMaps[0];
  }

  /**
   * Read the object maps of a predicate-object map, including those that refer to a parent triples map.
   * @param mapping The RML mapping.
   * @param predicateObjectMap The predicate-object map.
   * @return The object maps.
   */
  protected getObjectMaps(
    mapping: RmlMappingGraph,
    predicateObjectMap: RDF.Term,
  ): (RmlTermMap | IRmlReferencingObjectMap)[] {
    const objectMaps: (RmlTermMap | IRmlReferencingObjectMap)[] = mapping
      .getObjects(predicateObjectMap, RmlVocabulary.object)
      .map(constant => ({ constant }));
    for (const objectMap of mapping.getObjects(predicateObjectMap, RmlVocabulary.objectMap)) {
      const parentTriplesMap = mapping.getOptionalObject(objectMap, RmlVocabulary.parentTriplesMap);
      if (parentTriplesMap) {
        objectMaps.push({
          parentLogicalSource: this.getLogicalSource(mapping, parentTriplesMap),
          parentSubjectMap: this.getSubjectMap(mapping, parentTriplesMap),
          joinConditions: mapping.getObjects(objectMap, RmlVocabulary.joinCondition).map(joinCondition => ({
            child: mapping.getRequiredObject(joinCondition, RmlVocabulary.child).value,
            parent: mapping.getRequiredObject(joinCondition, RmlVocabulary.parent).value,
          })),
        });
      } else {
        objectMaps.push(this.getTermMap(mapping, objectMap, true));
      }
    }
    return objectMaps;
  }

  /**
   * Read the term maps of a resource, including those written with the constant shortcut.
   * @param mapping The RML mapping.
   * @param resource The resource that has the term maps.
   * @param termMapProperty The IRI of the property that refers to a term map.
   * @param constantProperty The IRI of the shortcut property that refers to a constant term.
   * @return The term maps.
   */
  protected getTermMaps(
    mapping: RmlMappingGraph,
    resource: RDF.Term,
    termMapProperty: string,
    constantProperty: string,
  ): RmlTermMap[] {
    return [
      ...mapping.getObjects(resource, constantProperty).map(constant => ({ constant })),
      ...mapping.getObjects(resource, termMapProperty).map(termMap => this.getTermMap(mapping, termMap, false)),
    ];
  }

  /**
   * Read a term map.
   * @param mapping The RML mapping.
   * @param termMap The term map.
   * @param isObjectMap If the term map generates objects, which are literals by default when not templated.
   * @return The term map.
   * @throws Error if the term map has no constant, reference or template, or an unsupported term type.
   */
  protected getTermMap(mapping: RmlMappingGraph, termMap: RDF.Term, isObjectMap: boolean): RmlTermMap {
    const constant = mapping.getOptionalObject(termMap, RmlVocabulary.constant);
    if (constant) {
      return { constant };
    }

    const reference = mapping.getOptionalObject(termMap, RmlVocabulary.reference)?.value;
    const template = mapping.getOptionalObject(termMap, RmlVocabulary.template)?.value;
    if (reference === undefined && template === undefined) {
      throw new Error(`Expected a constant, reference or template on the RML term map ${termMap.value}`);
    }

    const datatype = mapping.getOptionalObject(termMap, RmlVocabulary.datatype);
    const language = mapping.getOptionalObject(termMap, RmlVocabulary.language);
    const isLiteralByDefault = isObjectMap && (reference !== undefined || Boolean(datatype ?? language));
    const defaultTermType = isLiteralByDefault ?
      RmlVocabulary.Literal :
      RmlVocabulary.IRI;
    const termType = mapping.getOptionalObject(termMap, RmlVocabulary.termType)?.value ?? defaultTermType;
    if (termType !== RmlVocabulary.IRI && termType !== RmlVocabulary.BlankNode && termType !== RmlVocabulary.Literal) {
      throw new Error(`The RML term type <${termType}> is not supported`);
    }
    return { reference, template, termType, datatype, language };
  }
}
