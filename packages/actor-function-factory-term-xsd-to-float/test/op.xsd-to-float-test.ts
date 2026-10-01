import {
  runFuncTestTable,
  Notation,
} from '@comunica/utils-jest';
import { ActorFunctionFactoryTermXsdToFloat } from '../lib';

describe('to float', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermXsdToFloat(args),
    ],
    arity: 1,
    operation: 'xsd:float',
    notation: Notation.Function,
    testTable: `
        "-10.2E3" = "-1.02E4"^^xsd:float'
        "+33.3300" = "3.333E1"^^xsd:float'
        "0.0" = "0.0E0"^^xsd:float'
        "0" = "0.0E0"^^xsd:float'
        "0E1" = "0.0E0"^^xsd:float'
        "1.5" = "1.5E0"^^xsd:float'
        "1" = "1.0E0"^^xsd:float'
        "1E0" = "1.0E0"^^xsd:float'
        "13" = "1.3E1"^^xsd:float'
        "true"^^xsd:boolean = "1.0E0"^^xsd:float'
        "false"^^xsd:boolean = "0.0E0"^^xsd:float'
        "1"^^xsd:boolean = "1.0E0"^^xsd:float'
        "0"^^xsd:boolean = "0.0E0"^^xsd:float'
        "0"^^xsd:integer = "0.0E0"^^xsd:float'
        "1"^^xsd:integer = "1.0E0"^^xsd:float'
        "-1"^^xsd:integer = "-1.0E0"^^xsd:float'
        "0.0"^^xsd:decimal = "0.0E0"^^xsd:float'
        "1.0"^^xsd:decimal = "1.0E0"^^xsd:float'
        "-1.0"^^xsd:decimal = "-1.0E0"^^xsd:float'
        "0E1"^^xsd:double = "0.0E0"^^xsd:float'
        "1E0"^^xsd:double = "1.0E0"^^xsd:float'
        "0.0"^^xsd:float = "0.0E0"^^xsd:float'
        "1.0"^^xsd:float = "1.0E0"^^xsd:float'
        "1.25"^^xsd:float = "1.25E0"^^xsd:float'
        "-7.875"^^xsd:float = "-7.875E0"^^xsd:float'
        "2.5"^^xsd:decimal = "2.5E0"^^xsd:float'
        "-2.5"^^xsd:decimal = "-2.5E0"^^xsd:float'
        "NaN" = "NaN"^^xsd:float'
        "INF" = "INF"^^xsd:float'
        "+INF" = "INF"^^xsd:float'
        "-INF" = "-INF"^^xsd:float'
      `,
    errorTable: `
        "http://example.org/z"^^xsd:string = 'Invalid cast'
        "string"^^xsd:string = 'Invalid cast'
        "2002-10-10T17:00:00Z"^^xsd:string = 'Invalid cast'
        "true"^^xsd:string = 'Invalid cast'
        "false"^^xsd:string = 'Invalid cast'
        "foo"^^xsd:float = 'Invalid lexical form'
      `,
  });
});

// https://github.com/comunica/comunica/issues/1266
describe('xsd:float with spec-compliant precision', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermXsdToFloat(args),
    ],
    arity: 1,
    notation: Notation.Function,
    operation: 'xsd:float',
    testTable: `
      "0.1"^^xsd:double = "1.0E-1"^^xsd:float
      "0.1" = "1.0E-1"^^xsd:float
      "16777217"^^xsd:integer = "1.6777216E7"^^xsd:float
      "1.0E39"^^xsd:double = "INF"^^xsd:float
      "-0.0E0"^^xsd:double = "-0.0E0"^^xsd:float
      "-0" = "-0.0E0"^^xsd:float
      '" 0.5 "' = "5.0E-1"^^xsd:float
      "1.00000005960464477539062500000001" = "1.0000001E0"^^xsd:float
      "1.00000005960464477539062500000001"^^xsd:decimal = "1.0000001E0"^^xsd:float
      "1.000000059604644775390625"^^xsd:decimal = "1.0E0"^^xsd:float
      "-0.0"^^xsd:decimal = "0.0E0"^^xsd:float
    `,
  });
});
