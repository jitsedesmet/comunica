const RML_NAMESPACE = 'http://w3id.org/rml/';

/**
 * The terms of the RML vocabulary that the translation reads.
 */
export const RmlVocabulary = <const> {
  logicalSource: `${RML_NAMESPACE}logicalSource`,
  source: `${RML_NAMESPACE}source`,
  path: `${RML_NAMESPACE}path`,
  referenceFormulation: `${RML_NAMESPACE}referenceFormulation`,
  iterator: `${RML_NAMESPACE}iterator`,
  CSV: `${RML_NAMESPACE}CSV`,

  subject: `${RML_NAMESPACE}subject`,
  subjectMap: `${RML_NAMESPACE}subjectMap`,
  class: `${RML_NAMESPACE}class`,
  predicateObjectMap: `${RML_NAMESPACE}predicateObjectMap`,
  predicate: `${RML_NAMESPACE}predicate`,
  predicateMap: `${RML_NAMESPACE}predicateMap`,
  object: `${RML_NAMESPACE}object`,
  objectMap: `${RML_NAMESPACE}objectMap`,
  graph: `${RML_NAMESPACE}graph`,
  graphMap: `${RML_NAMESPACE}graphMap`,
  defaultGraph: `${RML_NAMESPACE}defaultGraph`,

  constant: `${RML_NAMESPACE}constant`,
  reference: `${RML_NAMESPACE}reference`,
  template: `${RML_NAMESPACE}template`,
  termType: `${RML_NAMESPACE}termType`,
  IRI: `${RML_NAMESPACE}IRI`,
  BlankNode: `${RML_NAMESPACE}BlankNode`,
  Literal: `${RML_NAMESPACE}Literal`,
  datatype: `${RML_NAMESPACE}datatype`,
  language: `${RML_NAMESPACE}language`,

  parentTriplesMap: `${RML_NAMESPACE}parentTriplesMap`,
  joinCondition: `${RML_NAMESPACE}joinCondition`,
  child: `${RML_NAMESPACE}child`,
  parent: `${RML_NAMESPACE}parent`,
};

/**
 * The properties of the RML vocabulary that the translation rejects, as ignoring them would give a different graph.
 */
export const RML_UNSUPPORTED_PROPERTIES: ReadonlySet<string> = new Set([
  'languageMap',
  'datatypeMap',
  'functionExecution',
  'logicalTarget',
  'gather',
  'childMap',
  'parentMap',
].map(localName => `${RML_NAMESPACE}${localName}`));

export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
