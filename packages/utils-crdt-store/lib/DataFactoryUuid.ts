import type { BaseQuad, BlankNode, Quad, Term } from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';

export class DataFactoryUuid<Q extends BaseQuad = Quad> extends DataFactory<Q> {
  public override blankNode(): BlankNode {
    return {
      value: crypto.randomUUID(),
      termType: 'BlankNode',
      equals(other: Term | null | undefined): boolean {
        return other?.termType === 'BlankNode' && other.value === this.value;
      },
    };
  }
}
