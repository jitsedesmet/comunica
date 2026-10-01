import {
  runFuncTestTable,
  Notation,
} from '@comunica/utils-jest';
import { ActorFunctionFactoryTermXsdToInteger } from '../lib';

describe('to integer', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermXsdToInteger(args),
    ],
    arity: 1,
    notation: Notation.Function,
    operation: 'xsd:integer',
    testTable: `
        "0" = "0"^^xsd:integer
        "1" = "1"^^xsd:integer
        "13" = "13"^^xsd:integer
        "true"^^xsd:boolean = "1"^^xsd:integer
        "false"^^xsd:boolean = "0"^^xsd:integer
        "1"^^xsd:boolean = "1"^^xsd:integer
        "0"^^xsd:boolean = "0"^^xsd:integer
        "0"^^xsd:integer = "0"^^xsd:integer
        "1"^^xsd:integer = "1"^^xsd:integer
        "-1"^^xsd:integer = "-1"^^xsd:integer
        "0.0"^^xsd:decimal = "0"^^xsd:integer
        "1.0"^^xsd:decimal = "1"^^xsd:integer
        "-1.0"^^xsd:decimal = "-1"^^xsd:integer
        "0E1"^^xsd:double = "0"^^xsd:integer
        "1E0"^^xsd:double = "1"^^xsd:integer
        "0.0"^^xsd:float = "0"^^xsd:integer
        "1.0"^^xsd:float = "1"^^xsd:integer
        "1.25"^^xsd:float = "1"^^xsd:integer
        "-7.875"^^xsd:float = "-7"^^xsd:integer
        "2.5"^^xsd:decimal = "2"^^xsd:integer
        "-2.5"^^xsd:decimal = "-2"^^xsd:integer
      `,
    errorTable: `
        "-10.2E3"^^xsd:string = 'Invalid cast'
        "+33.3300"^^xsd:string = 'Invalid cast'
        "0.0"^^xsd:string = 'Invalid cast'
        "0E1"^^xsd:string = 'Invalid cast'
        "1.5"^^xsd:string = 'Invalid cast'
        "1E0"^^xsd:string = 'Invalid cast'
        "2002-10-10T17:00:00Z"^^xsd:string = 'Invalid cast'
        "false"^^xsd:string = 'Invalid cast'
        "true"^^xsd:string = 'Invalid cast'
        "foo"^^xsd:integer = 'Invalid lexical form'
        "NaN"^^xsd:double = 'Invalid cast'
        "+INF"^^xsd:double = 'Invalid cast'
        "-INF"^^xsd:double = 'Invalid cast'
      `,
  });
});

// https://github.com/comunica/comunica/issues/1266
describe('xsd:integer with spec-compliant precision', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermXsdToInteger(args),
    ],
    arity: 1,
    notation: Notation.Function,
    operation: 'xsd:integer',
    testTable: `
      "-1" = "-1"^^xsd:integer
      "+1" = "1"^^xsd:integer
      "12345678901234567890123" = "12345678901234567890123"^^xsd:integer
      "123456789012345678901234567890.9"^^xsd:decimal = "123456789012345678901234567890"^^xsd:integer
      "-123456789012345678901234567890.9"^^xsd:decimal = "-123456789012345678901234567890"^^xsd:integer
      "1.0E20"^^xsd:double = "100000000000000000000"^^xsd:integer
      "-0.9"^^xsd:double = "0"^^xsd:integer
    `,
    errorTable: `
      ""^^xsd:string = 'Invalid cast'
      "1e3"^^xsd:string = 'Invalid cast'
    `,
  });
});
