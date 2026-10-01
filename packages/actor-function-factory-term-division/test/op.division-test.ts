import { KeysExpressionEvaluator } from '@comunica/context-entries';
import { ActionContext } from '@comunica/core';
import * as Eval from '@comunica/utils-expression-evaluator';
import {
  runFuncTestTable,
  decimal,
  numeric,
  Notation,
} from '@comunica/utils-jest';
import type { FuncTestTableConfig } from '@comunica/utils-jest';
import { LRUCache } from 'lru-cache';
import { ActorFunctionFactoryTermDivision } from '../lib';

describe('evaluation of \'/\' like', () => {
  const config: FuncTestTableConfig<object> = {
    registeredActors: [
      args => new ActorFunctionFactoryTermDivision(args),
    ],
    arity: 2,
    operation: '/',
    aliases: numeric,
    notation: Notation.Infix,
  };
  runFuncTestTable({
    ...config,
    testTable: `
      0i   1i  = 0d
      2i   1i  = 2d
      12i  6i  = 2d
      6i   INF = 0f
      6i  -INF = 0f
    
      -0f  -0f =  NaN
       1f  -1f = -1f
       12f  6f =  2f
      -3f   0f = -INF
       3f   0f =  INF
    
      INF -INF = NaN
      INF  0f  = INF
      0f  -INF = 0f
    
      NaN    NaN    = NaN
      NaN    anyNum = NaN
      anyNum NaN    = NaN
    `,
    errorTable: `
      0i 0i = 'Integer division by 0'
      3i 0i = 'Integer division by 0'
    `,
  });
  // https://github.com/comunica/comunica/issues/1266
  describe('with spec-compliant precision', () => {
    runFuncTestTable({
      ...config,
      testTable: `
        "0.3"^^xsd:double "0.1"^^xsd:double = "2.9999999999999996E0"^^xsd:double
        "1"^^xsd:double "3"^^xsd:double = "3.333333333333333E-1"^^xsd:double
        "1"^^xsd:float "3"^^xsd:float = "3.3333334E-1"^^xsd:float
        "0.3"^^xsd:decimal "0.1"^^xsd:decimal = "3.0"^^xsd:decimal
        "1"^^xsd:decimal "4"^^xsd:decimal = "0.25"^^xsd:decimal
        "2"^^xsd:integer "3"^^xsd:integer = "0.66666666666666666667"^^xsd:decimal
        "123456789012345678901234567890"^^xsd:integer "10"^^xsd:integer = "12345678901234567890123456789.0"^^xsd:decimal
        "1"^^xsd:decimal "0"^^xsd:double = "INF"^^xsd:double
        "-1"^^xsd:decimal "0"^^xsd:float = "-INF"^^xsd:float
      `,
      errorTable: `
        "1"^^xsd:decimal "0"^^xsd:decimal = 'Decimal division by 0'
        "1"^^xsd:decimal "0"^^xsd:integer = 'Decimal division by 0'
        "1.5"^^xsd:decimal "0.0"^^xsd:decimal = 'Decimal division by 0'
      `,
    });
  });
  runFuncTestTable({
    ...config,
    config: new ActionContext().set(KeysExpressionEvaluator.superTypeProvider, {
      cache: new LRUCache<string, any>({ max: 1_000 }),
      discoverer: () => Eval.TypeURL.XSD_INTEGER,
    }),
    testTable: `
      "2"^^example:int "2"^^example:int = ${decimal('1.0')}
    `,
    errorTable: `
      "2"^^example:int "0"^^example:int = 'Integer division by 0'
    `,
  });
});
