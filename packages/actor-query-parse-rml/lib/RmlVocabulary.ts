export const RML_NAMESPACE = 'http://w3id.org/rml/';

/**
 * The terms of the RML vocabulary that the translation reads.
 * A mapping that uses another property of the vocabulary is rejected, as ignoring it would give a different graph.
 */
export const RmlVocabulary = <const> {
  logicalSource: `${RML_NAMESPACE}logicalSource`,
  source: `${RML_NAMESPACE}source`,
  path: `${RML_NAMESPACE}path`,
  root: `${RML_NAMESPACE}root`,
  CurrentWorkingDirectory: `${RML_NAMESPACE}CurrentWorkingDirectory`,
  referenceFormulation: `${RML_NAMESPACE}referenceFormulation`,
  iterator: `${RML_NAMESPACE}iterator`,

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
  URI: `${RML_NAMESPACE}URI`,
  UnsafeIRI: `${RML_NAMESPACE}UnsafeIRI`,
  BlankNode: `${RML_NAMESPACE}BlankNode`,
  Literal: `${RML_NAMESPACE}Literal`,
  datatype: `${RML_NAMESPACE}datatype`,
  datatypeMap: `${RML_NAMESPACE}datatypeMap`,
  language: `${RML_NAMESPACE}language`,
  languageMap: `${RML_NAMESPACE}languageMap`,
  baseIRI: `${RML_NAMESPACE}baseIRI`,

  parentTriplesMap: `${RML_NAMESPACE}parentTriplesMap`,
  joinCondition: `${RML_NAMESPACE}joinCondition`,
  child: `${RML_NAMESPACE}child`,
  childMap: `${RML_NAMESPACE}childMap`,
  parent: `${RML_NAMESPACE}parent`,
  parentMap: `${RML_NAMESPACE}parentMap`,
};

export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
