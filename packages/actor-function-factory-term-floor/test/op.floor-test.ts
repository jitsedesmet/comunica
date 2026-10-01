import {
  runFuncTestTable,
  Notation,
} from '@comunica/utils-jest';
import { ActorFunctionFactoryTermFloor } from '../lib';

// https://github.com/comunica/comunica/issues/1266
describe('evaluation of \'FLOOR\' with spec-compliant precision', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermFloor(args),
    ],
    arity: 1,
    operation: 'FLOOR',
    notation: Notation.Function,
    testTable: `
      "1.9999999999999999999999"^^xsd:decimal = "1.0"^^xsd:decimal
      "-1.0000000000000000000001"^^xsd:decimal = "-2.0"^^xsd:decimal
      "123456789012345678901234567890"^^xsd:integer = "123456789012345678901234567890"^^xsd:integer
      "1.9999999999999999999999"^^xsd:double = "2.0E0"^^xsd:double
      "-1.5"^^xsd:float = "-2.0E0"^^xsd:float
      "INF"^^xsd:double = "INF"^^xsd:double
      "-0.0E0"^^xsd:float = "-0.0E0"^^xsd:float
    `,
  });
});
