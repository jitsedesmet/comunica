import {
  runFuncTestTable,
  Notation,
} from '@comunica/utils-jest';
import { ActorFunctionFactoryTermUnaryMinus } from '../lib';

describe('evaluation of \'- (unary)\' like', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermUnaryMinus(args),
    ],
    arity: 1,
    operation: '-',
    notation: Notation.Prefix,
    testTable: `
        "3"^^xsd:integer     = "-3"^^xsd:integer
        "3"^^xsd:decimal     = "-3.0"^^xsd:decimal
        "3"^^xsd:float       = "-3.0E0"^^xsd:float
        "3"^^xsd:double      = "-3.0E0"^^xsd:double
        "0"^^xsd:integer     = "0"^^xsd:integer
        "-10.5"^^xsd:decimal = "10.5"^^xsd:decimal
        "NaN"^^xsd:float     = "NaN"^^xsd:float
        "-0"^^xsd:float      = "0.0E0"^^xsd:float
        "-INF"^^xsd:float    = "INF"^^xsd:float
        "INF"^^xsd:float     = "-INF"^^xsd:float
      `,
  });
});

// https://github.com/comunica/comunica/issues/1266
describe('evaluation of \'- (unary)\' with spec-compliant precision', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermUnaryMinus(args),
    ],
    arity: 1,
    operation: '-',
    notation: Notation.Prefix,
    testTable: `
        "123456789012345678901234567890"^^xsd:integer = "-123456789012345678901234567890"^^xsd:integer
        "-0.1000000000000000000001"^^xsd:decimal = "0.1000000000000000000001"^^xsd:decimal
        "0.1"^^xsd:float = "-1.0E-1"^^xsd:float
      `,
  });
});
