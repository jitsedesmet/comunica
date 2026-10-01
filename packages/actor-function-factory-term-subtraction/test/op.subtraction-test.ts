import type { FuncTestTableConfig } from '@comunica/utils-jest';
import {
  runFuncTestTable,
  dateTimeTyped,
  error,
  merge,
  numeric,
  yearMonthDurationTyped,
  Notation,
} from '@comunica/utils-jest';
import { ActorFunctionFactoryTermSubtraction } from '../lib';

const config: FuncTestTableConfig<object> = {
  registeredActors: [
    args => new ActorFunctionFactoryTermSubtraction(args),
  ],
  arity: 2,
  operation: '-',
  aliases: merge(numeric, error),
  notation: Notation.Infix,
};

describe('evaluation of \'-\' like', () => {
  runFuncTestTable({
    ...config,
    testTable: `
      0i 0i = 0i
      1i 0i = 1i
      2i 1i = 1i
    
      -0f  0f  =  0f
      -1f  1f  = -2f
      -6f -12f =  6f
      -6i -12f =  6f
    
      -3f 3i = -6f
    
       0i   INF = -INF
      -INF -12f = -INF
       3i  -INF =  INF
       INF -INF =  INF
      -INF  INF = -INF
    
      NaN    NaN    = NaN
      NaN    anyNum = NaN
      anyNum NaN    = NaN
      
      '${dateTimeTyped('2019-05-28T12:14:45Z')}' '${yearMonthDurationTyped('P1Y1M')}' = '${dateTimeTyped('2018-04-28T12:14:45Z')}'
    `,
    errorTable: `
      anyNum invalidDateTime  = 'Argument types not valid'
      invalidDateTime  anyNum = 'Argument types not valid'
      invalidDateTime  invalidDateTime  = 'Invalid lexical form'
    `,
  });
});

// https://github.com/comunica/comunica/issues/1266
describe('evaluation of \'-\' with spec-compliant precision', () => {
  runFuncTestTable({
    ...config,
    testTable: `
      "0.3"^^xsd:double "0.1"^^xsd:double = "1.9999999999999998E-1"^^xsd:double
      "0.3"^^xsd:float "0.1"^^xsd:float = "2.0000002E-1"^^xsd:float
      "0.3"^^xsd:decimal "0.1"^^xsd:decimal = "0.2"^^xsd:decimal
      "0.3"^^xsd:decimal "0.1"^^xsd:double = "1.9999999999999998E-1"^^xsd:double
      "0.3000000000000000000001"^^xsd:decimal "0.3"^^xsd:decimal = "0.0000000000000000000001"^^xsd:decimal
      "9007199254740993"^^xsd:integer "9007199254740992"^^xsd:integer = "1"^^xsd:integer
      "-123456789012345678901234567890"^^xsd:integer "1"^^xsd:integer = "-123456789012345678901234567891"^^xsd:integer
    `,
  });
});
