import { TermFunctionBase } from '@comunica/bus-function-factory';

import {
  BigNumber,
  declare,
  SparqlOperator,
} from '@comunica/utils-expression-evaluator';

/**
 * https://www.w3.org/TR/sparql11-query/#func-round
 */
export class TermFunctionRound extends TermFunctionBase {
  public constructor() {
    super({
      arity: 1,
      operator: SparqlOperator.ROUND,
      overloads: declare(SparqlOperator.ROUND)
        // Rounds half towards positive infinity, just like Math.round: https://www.w3.org/TR/xpath-functions/#func-round
        .numericConverter(() => num => num.integerValue(BigNumber.ROUND_HALF_CEIL), () => num => Math.round(num))
        .collect(),
    });
  }
}
