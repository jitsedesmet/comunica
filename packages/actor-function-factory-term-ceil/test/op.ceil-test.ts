import {
  runFuncTestTable,
  Notation,
} from '@comunica/utils-jest';
import { ActorFunctionFactoryTermCeil } from '../lib';

// https://github.com/comunica/comunica/issues/1266
describe('evaluation of \'CEIL\' with spec-compliant precision', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermCeil(args),
    ],
    arity: 1,
    operation: 'CEIL',
    notation: Notation.Function,
    testTable: `
      "1.0000000000000000000001"^^xsd:decimal = "2.0"^^xsd:decimal
      "-1.5"^^xsd:decimal = "-1.0"^^xsd:decimal
      "123456789012345678901234567890"^^xsd:integer = "123456789012345678901234567890"^^xsd:integer
      "1.0000000000000000000001"^^xsd:double = "1.0E0"^^xsd:double
      "1.5"^^xsd:float = "2.0E0"^^xsd:float
      "-INF"^^xsd:float = "-INF"^^xsd:float
      "-0.5"^^xsd:double = "-0.0E0"^^xsd:double
      "-0.5"^^xsd:decimal = "0.0"^^xsd:decimal
    `,
  });
});
