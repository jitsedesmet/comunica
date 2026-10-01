import { TermFunctionBase } from '@comunica/bus-function-factory';

import {
  declare,
  SparqlOperator,
} from '@comunica/utils-expression-evaluator';

export class TermFunctionMultiplication extends TermFunctionBase {
  public constructor() {
    super({
      arity: 2,
      operator: SparqlOperator.MULTIPLICATION,
      overloads: declare(SparqlOperator.MULTIPLICATION)
        .arithmetic(() => (left, right) => left.times(right), () => (left, right) => left * right)
        .collect(),
    });
  }
}
