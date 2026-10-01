import {
  runFuncTestTable,
  Notation,
} from '@comunica/utils-jest';
import { ActorFunctionFactoryTermRound } from '../lib';

// https://github.com/comunica/comunica/issues/1266
describe('evaluation of \'ROUND\' with spec-compliant precision', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermRound(args),
    ],
    arity: 1,
    operation: 'ROUND',
    notation: Notation.Function,
    testTable: `
      "2.5"^^xsd:decimal = "3.0"^^xsd:decimal
      "-2.5"^^xsd:decimal = "-2.0"^^xsd:decimal
      "-2.6"^^xsd:decimal = "-3.0"^^xsd:decimal
      "0.49999999999999999999"^^xsd:decimal = "0.0"^^xsd:decimal
      "12345678901234567890.5"^^xsd:decimal = "12345678901234567891.0"^^xsd:decimal
      "9007199254740993"^^xsd:integer = "9007199254740993"^^xsd:integer
      "2.5"^^xsd:double = "3.0E0"^^xsd:double
      "-2.5"^^xsd:double = "-2.0E0"^^xsd:double
      "0.49999999999999994"^^xsd:double = "0.0E0"^^xsd:double
      "2.5"^^xsd:float = "3.0E0"^^xsd:float
      "INF"^^xsd:double = "INF"^^xsd:double
      "NaN"^^xsd:double = "NaN"^^xsd:double
    `,
  });
});
