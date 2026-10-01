import {
  runFuncTestTable,
  Notation,
} from '@comunica/utils-jest';
import { ActorFunctionFactoryTermAbs } from '../lib';

// https://github.com/comunica/comunica/issues/1266
describe('evaluation of \'ABS\' with spec-compliant precision', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermAbs(args),
    ],
    arity: 1,
    operation: 'ABS',
    notation: Notation.Function,
    testTable: `
      "-123456789012345678901234567890"^^xsd:integer = "123456789012345678901234567890"^^xsd:integer
      "-0.1000000000000000000001"^^xsd:decimal = "0.1000000000000000000001"^^xsd:decimal
      "-0.1"^^xsd:double = "1.0E-1"^^xsd:double
      "-0.1"^^xsd:float = "1.0E-1"^^xsd:float
      "-INF"^^xsd:double = "INF"^^xsd:double
      "NaN"^^xsd:float = "NaN"^^xsd:float
    `,
  });
});
