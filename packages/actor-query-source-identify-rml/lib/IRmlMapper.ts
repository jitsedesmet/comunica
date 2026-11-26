/**
 * An engine that executes RML mappings.
 */
export interface IRmlMapper {
  /**
   * Execute an RML mapping.
   * @param mapping An RML mapping document, serialized as Turtle.
   * @param inputFiles The contents of the logical sources, keyed by the `rml:source` value they have in the mapping.
   * @return The generated RDF, serialized as N-Quads.
   */
  map: (mapping: string, inputFiles: Record<string, string>) => Promise<string>;
}
