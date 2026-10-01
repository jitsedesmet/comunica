import { KeysExpressionEvaluator } from '@comunica/context-entries';
import { ActionContext } from '@comunica/core';
import * as Eval from '@comunica/utils-expression-evaluator';
import {
  runFuncTestTable,
  dateTimeTyped,
  dayTimeDurationTyped,
  int,
  numeric,
  Notation,
} from '@comunica/utils-jest';
import type { FuncTestTableConfig } from '@comunica/utils-jest';
import { LRUCache } from 'lru-cache';
import { ActorFunctionFactoryTermAddition } from '../lib';

describe('evaluation of \'+\' like', () => {
  const baseConfig: FuncTestTableConfig<object> = {
    registeredActors: [
      args => new ActorFunctionFactoryTermAddition(args),
    ],
    arity: 2,
    operation: '+',
    aliases: numeric,
    notation: Notation.Infix,
  };
  runFuncTestTable({
    ...baseConfig,
    testTable: `
      0i 0i = 0i
      0i 1i = 1i
      1i 2i = 3i
    
      -0f -0f = -0f
      -0f -1f = -1f
      -1f -2f = -3f
      
      0i 1d = 1d
      1d 0i = 1d
    
       2i -1f = 1f
    
      -12f  INF =  INF
      -INF -12f = -INF
      -INF -INF = -INF
       INF  INF =  INF
       INF -INF =  NaN
    
      NaN    NaN    = NaN
      NaN    anyNum = NaN
      anyNum NaN    = NaN

      0i 0d = 0d
      0i 0f = 0f
      0i "0"^^xsd:double = "0.0E0"^^xsd:double
      0d 0i = 0d
      0d 0f = 0f
      0d "0"^^xsd:double = "0.0E0"^^xsd:double
      0f 0i = 0f
      0f 0d = 0f
      0f "0"^^xsd:double = "0.0E0"^^xsd:double
      "0"^^xsd:double 0i = "0.0E0"^^xsd:double
      "0"^^xsd:double 0d = "0.0E0"^^xsd:double
      "0"^^xsd:double 0f = "0.0E0"^^xsd:double
      
      '${dateTimeTyped('2012-02-28T12:14:45Z')}' '${dayTimeDurationTyped('P2D')}' = '${dateTimeTyped('2012-03-01T12:14:45Z')}'
    `,
    errorTable: `
      "apple"^^xsd:integer "0"^^xsd:integer = 'Invalid lexical form'
    `,
  });
  // https://github.com/comunica/comunica/issues/1266
  describe('with spec-compliant precision', () => {
    runFuncTestTable({
      ...baseConfig,
      testTable: `
        "0.1"^^xsd:double "0.2"^^xsd:double = "3.0000000000000004E-1"^^xsd:double
        "0.1"^^xsd:float "0.2"^^xsd:float = "3.0E-1"^^xsd:float
        "16777216"^^xsd:float "1"^^xsd:float = "1.6777216E7"^^xsd:float
        "3.4E38"^^xsd:float "3.4E38"^^xsd:float = "INF"^^xsd:float
        "0.1"^^xsd:decimal "0.2"^^xsd:decimal = "0.3"^^xsd:decimal
        "0.1"^^xsd:decimal "0.2"^^xsd:double = "3.0000000000000004E-1"^^xsd:double
        "0.1"^^xsd:decimal "0.2"^^xsd:float = "3.0E-1"^^xsd:float
        "0.1000000000000000000001"^^xsd:decimal "0.1"^^xsd:decimal = "0.2000000000000000000001"^^xsd:decimal
        "9007199254740993"^^xsd:integer "1"^^xsd:integer = "9007199254740994"^^xsd:integer
        "123456789012345678901234567890"^^xsd:integer "1"^^xsd:integer = "123456789012345678901234567891"^^xsd:integer
        "123456789012345678901234567890"^^xsd:integer "0.5"^^xsd:decimal = "123456789012345678901234567890.5"^^xsd:decimal
      `,
      errorTable: `
        "apple"^^xsd:decimal "0"^^xsd:double = 'Invalid lexical form'
        "0"^^xsd:double "apple"^^xsd:decimal = 'Invalid lexical form'
        "apple"^^xsd:decimal "0"^^xsd:float = 'Invalid lexical form'
      `,
    });
  });
  runFuncTestTable({
    ...baseConfig,
    config: new ActionContext().set(KeysExpressionEvaluator.superTypeProvider, {
      cache: new LRUCache<string, any>({ max: 1_000 }),
      discoverer: () => Eval.TypeURL.XSD_INTEGER,
    }),
    testTable: `
      "2"^^example:int "3"^^example:int = ${int('5')}
    `,
  });
});
