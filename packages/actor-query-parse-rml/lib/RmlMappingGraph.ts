import type * as RDF from '@rdfjs/types';

/**
 * The quads of an RML mapping, indexed for lookups by subject and property.
 */
export class RmlMappingGraph {
  private readonly quads: RDF.Quad[];
  private readonly objectsBySubjectAndProperty = new Map<string, RDF.Term[]>();

  public constructor(quads: RDF.Quad[]) {
    this.quads = quads;
    for (const quad of quads) {
      const subjectAndProperty = RmlMappingGraph.getSubjectAndPropertyKey(quad.subject, quad.predicate.value);
      const objects = this.objectsBySubjectAndProperty.get(subjectAndProperty);
      if (objects) {
        objects.push(quad.object);
      } else {
        this.objectsBySubjectAndProperty.set(subjectAndProperty, [ quad.object ]);
      }
    }
  }

  /**
   * Get the distinct subjects that have a value for a property.
   * @param property The IRI of the property.
   * @return The subjects, in the order of the mapping.
   */
  public getSubjects(property: string): RDF.Term[] {
    const subjects: RDF.Term[] = [];
    for (const quad of this.quads) {
      if (quad.predicate.value === property && !subjects.some(subject => subject.equals(quad.subject))) {
        subjects.push(quad.subject);
      }
    }
    return subjects;
  }

  /**
   * Get all values of a property of a subject.
   * @param subject The subject to read.
   * @param property The IRI of the property.
   * @return The values, in the order of the mapping.
   */
  public getObjects(subject: RDF.Term, property: string): RDF.Term[] {
    return this.objectsBySubjectAndProperty.get(RmlMappingGraph.getSubjectAndPropertyKey(subject, property)) ?? [];
  }

  /**
   * Get the value of a property that a subject has at most once.
   * @param subject The subject to read.
   * @param property The IRI of the property.
   * @return The value, or undefined if the subject has none.
   * @throws Error if the subject has multiple values for the property.
   */
  public getOptionalObject(subject: RDF.Term, property: string): RDF.Term | undefined {
    const objects = this.getObjects(subject, property);
    if (objects.length > 1) {
      throw new Error(`Expected at most one <${property}> on ${subject.value} in the RML mapping`);
    }
    return objects[0];
  }

  /**
   * Get the value of a property that a subject has exactly once.
   * @param subject The subject to read.
   * @param property The IRI of the property.
   * @return The value.
   * @throws Error if the subject does not have exactly one value for the property.
   */
  public getRequiredObject(subject: RDF.Term, property: string): RDF.Term {
    const object = this.getOptionalObject(subject, property);
    if (!object) {
      throw new Error(`Expected a <${property}> on ${subject.value} in the RML mapping`);
    }
    return object;
  }

  private static getSubjectAndPropertyKey(subject: RDF.Term, property: string): string {
    return `${subject.termType} ${subject.value} ${property}`;
  }
}
