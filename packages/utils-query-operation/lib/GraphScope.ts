import type { AlgebraFactory } from '@comunica/utils-algebra';
import { Algebra, algebraUtils } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';

/**
 * Make the quad patterns and property paths of an operation match the given graph instead of the default graph.
 * Nested GRAPH and SERVICE operations are left untouched, as they define the graphs of their own patterns.
 * @param operation The operation that is evaluated over the given graph.
 * @param graph The graph to match.
 * @param algebraFactory The algebra factory.
 * @return A new operation, the given operation is not modified.
 */
export function scopeOperationToGraph(
  operation: Algebra.Operation,
  graph: RDF.Term,
  algebraFactory: AlgebraFactory,
): Algebra.Operation {
  const keepOwnScope = { preVisitor: () => ({ continue: false }) };
  return algebraUtils.mapOperation(operation, {
    [Algebra.Types.GRAPH]: keepOwnScope,
    [Algebra.Types.SERVICE]: keepOwnScope,
    [Algebra.Types.PATTERN]: {
      transform: pattern => pattern.graph.termType === 'DefaultGraph' ?
        Object.assign(
          algebraFactory.createPattern(pattern.subject, pattern.predicate, pattern.object, graph),
          { metadata: pattern.metadata },
        ) :
        pattern,
    },
    [Algebra.Types.PATH]: {
      transform: path => path.graph.termType === 'DefaultGraph' ?
        Object.assign(
          algebraFactory.createPath(path.subject, path.predicate, path.object, graph),
          { metadata: path.metadata },
        ) :
        path,
    },
  });
}
