import type { FuncTestTableConfig } from '@comunica/utils-jest';
import {
  runFuncTestTable,
  error,
  merge,
  numeric,
  Notation,
} from '@comunica/utils-jest';
import { ActorFunctionFactoryTermMultiplication } from '../lib';

const config: FuncTestTableConfig<object> = {
  registeredActors: [
    args => new ActorFunctionFactoryTermMultiplication(args),
  ],
  arity: 2,
  operation: '*',
  aliases: merge(numeric, error),
  notation: Notation.Infix,
};

describe('evaluation of \'*\' like', () => {
  runFuncTestTable({
    ...config,
    testTable: `
      0i 0i = 0i
      0i 1i = 0i
      1i 2i = 2i
      3i 4i = 12i
    
      -0f -0f =  0f
      -0f -1f =  0f
      -1f -2f =  2f
      -3f  4f = -12f
       2f  6f =  12f
    
       0f   INF =  NaN
      -INF  0i  =  NaN
       INF -INF = -INF
       3i   INF =  INF
      -INF  6f  = -INF
      -INF -3f  =  INF
    
      NaN    NaN    = NaN
      NaN    anyNum = NaN
      anyNum NaN    = NaN
    `,
    errorTable: `
      anyNum invalidDateTime = 'Argument types not valid for operator'
      invalidDateTime  anyNum   = 'Argument types not valid for operator'
      invalidDateTime  invalidDateTime = 'Argument types not valid for operator'
    `,
  });
});

// https://github.com/comunica/comunica/issues/1266
describe('evaluation of \'*\' with spec-compliant precision', () => {
  runFuncTestTable({
    ...config,
    testTable: `
      "0.1"^^xsd:double "3"^^xsd:double = "3.0000000000000004E-1"^^xsd:double
      "0.1"^^xsd:float "3"^^xsd:float = "3.0E-1"^^xsd:float
      "3.4E38"^^xsd:float "10"^^xsd:float = "INF"^^xsd:float
      "1.0E-45"^^xsd:float "0.1"^^xsd:float = "0.0E0"^^xsd:float
      "0.1"^^xsd:decimal "3"^^xsd:decimal = "0.3"^^xsd:decimal
      "0.1"^^xsd:decimal "3"^^xsd:double = "3.0000000000000004E-1"^^xsd:double
      "9007199254740993"^^xsd:integer "3"^^xsd:integer = "27021597764222979"^^xsd:integer
      "123456789012345678901234567890"^^xsd:integer "123456789012345678901234567890"^^xsd:integer = "15241578753238836750495351562536198787501905199875019052100"^^xsd:integer
      "0.000000000000000000001"^^xsd:decimal "0.000000000000000000001"^^xsd:decimal = "0.000000000000000000000000000000000000000001"^^xsd:decimal
    `,
  });
});
