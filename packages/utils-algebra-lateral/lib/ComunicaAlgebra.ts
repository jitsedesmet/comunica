import type { Algebra } from '@comunica/utils-algebra';

export type Lateral = {
  type: 'lateral';
  input: [Algebra.Operation, Algebra.Operation];
  metadata?: Record<string, unknown>;
};
