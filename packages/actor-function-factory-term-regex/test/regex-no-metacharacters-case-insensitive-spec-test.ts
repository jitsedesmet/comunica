import { runFuncTestTable } from '@comunica/bus-function-factory/test/util';
import * as Data from '@comunica/utils-expression-evaluator/test/spec/_data';
import { bool } from '@comunica/utils-expression-evaluator/test/util/Aliases';
import { Notation } from '@comunica/utils-expression-evaluator/test/util/TestTable';
import { ActorFunctionFactoryTermRegex } from '../lib';

/**
 * REQUEST: regex-no-metacharacters-case-insensitive.rq
 *
 * PREFIX  rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 * PREFIX  ex: <http://example.com/#>
 *
 * SELECT ?val
 * WHERE {
 *    ex:foo rdf:value ?val .
 *    FILTER regex(?val, "a?+*.{}()[]C", "iq")
 * }
 */

/**
 * Manifest Entry
 * :regex-no-metacharacters-case-insensitive a mf:QueryEvaluationTest ;
 *       mf:name    "REGEX with the iq option" ;
 *       mf:action
 *           [ qt:query  <regex-no-metacharacters-case-insensitive.rq> ;
 *             qt:data   <regex-data-quantifiers.ttl> ] ;
 *       mf:result  <regex-no-metacharacters.srx> .
 */

// We do not support the 'q' flag yet.
// eslint-disable-next-line jest/no-disabled-tests
describe.skip('We should respect the regex-no-metacharacters-case-insensitive spec', () => {
  const { s1, s2, s3, s4, s5, s6, s7, s8, s9, s10 } = Data.dataRegexQuantifiers();
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermRegex(args),
    ],
    arity: 'vary',
    notation: Notation.Function,
    operation: 'regex',
    aliases: bool,
    testTable: `
      '${s1}' '"a?+*.{}()[]C"' '"iq"' = false
      '${s2}' '"a?+*.{}()[]C"' '"iq"' = false
      '${s3}' '"a?+*.{}()[]C"' '"iq"' = false
      '${s4}' '"a?+*.{}()[]C"' '"iq"' = false
      '${s5}' '"a?+*.{}()[]C"' '"iq"' = false
      '${s6}' '"a?+*.{}()[]C"' '"iq"' = false
      '${s7}' '"a?+*.{}()[]C"' '"iq"' = false
      '${s8}' '"a?+*.{}()[]C"' '"iq"' = false
      '${s9}' '"a?+*.{}()[]C"' '"iq"' = true
      '${s10}' '"a?+*.{}()[]C"' '"iq"' = false
    `,
  });
});

/**
 * RESULTS: regex-no-metacharacters.srx
 *
 * <?xml version="1.0"?>
 * <sparql>
 *    <head>
 *        <variable name="val"/>
 *    </head>
 *    <results>
 *        <result>
 *            <binding name="val">
 *                <literal>a?+*.{}()[]c</literal>
 *            </binding>
 *        </result>
 *    </results>
 * </sparql>
 */