import type * as RDF from '@rdfjs/types';
import { AlgebraFactory as AlgebraFactoryBase } from '@traqula/algebra-transformations-1-2';
import type { QuadTermName } from 'rdf-terms';
import type { DistinctTerms, Nodes, RmlLogicalSource, RmlLogicalSourceReference } from './Algebra';
import { TypesComunica } from './TypesComunica';

export class AlgebraFactory extends AlgebraFactoryBase {
  public createNodes(graph: RDF.Term, variable: RDF.Variable): Nodes {
    return {
      type: TypesComunica.NODES,
      graph,
      variable,
    };
  }

  public createDistinctTerms(
    variables: RDF.Variable[],
    terms: Record<string, QuadTermName>,
    filters?: Partial<Record<QuadTermName, RDF.Term>>,
  ): DistinctTerms {
    return {
      type: TypesComunica.DISTINCT_TERMS,
      variables,
      terms,
      filters,
    };
  }

  /**
   * Create the source operator of the RML algebra.
   * @param sourceUrl The URL or path of the data source.
   * @param referenceFormulation The IRI of the language the iterator and references are written in.
   * @param references The references to evaluate on each record, and the variables to bind their values to.
   * @param iterator The expression selecting the records of the source, if the reference formulation needs one.
   * @return The RML logical source operation.
   */
  public createRmlLogicalSource(
    sourceUrl: string,
    referenceFormulation: string,
    references: RmlLogicalSourceReference[],
    iterator?: string,
  ): RmlLogicalSource {
    return {
      type: TypesComunica.RML_LOGICAL_SOURCE,
      sourceUrl,
      referenceFormulation,
      iterator,
      references,
    };
  }
}
