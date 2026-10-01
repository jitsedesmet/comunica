/* eslint-disable import/no-nodejs-modules */
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
/* eslint-enable import/no-nodejs-modules */
const { KeysExpressionEvaluator } = require('@comunica/context-entries');
const { ActionContext } = require('@comunica/core');
const { BindingsFactory } = require('@comunica/utils-bindings-factory');
const { isNonLexicalLiteral, isSubTypeOf, TermTransformer } = require('@comunica/utils-expression-evaluator');
const { SaxesParser } = require('@rubensworks/saxes');
const { ExpressionEngine } = require('..');
const knownFailures = require('./xpath-test-suite-known-failures');
const { xpathToAlgebra, UnsupportedError, AF, DF, XSD } = require('./xpath-to-algebra');

/**
 * Runs the tests of the W3C XQuery and XPath Test Suite (QT3, https://github.com/w3c/qt3tests)
 * that can be expressed in SPARQL through the expression engine.
 *
 * SPARQL 1.2 uses XPath and XQuery Functions and Operators 3.1 with XSD 1.1,
 * so tests are selected for XPath 3.1 and XSD 1.1.
 * Tests that cannot be expressed in SPARQL, or that depend on unsupported features, are skipped.
 * Known failures (see xpath-test-suite-known-failures.js) are still run, but do not fail the test suite,
 * and are reported when they pass, so that they can be removed from that list.
 *
 * Usage: node xpath-test-suite.js [-c cacheDirectory] [-t testSetRegex] [--skip testNameRegex] [-v]
 */

// A fixed commit of the test suite, so that results are reproducible.
const QT3_COMMIT = '201a6e466940cdfc727f4babfedcde5332b9f578';
const QT3_BASE = `https://raw.githubusercontent.com/w3c/qt3tests/${QT3_COMMIT}/`;

// The test sets for the functions and operators that SPARQL defines in terms of XPath.
const DEFAULT_TEST_SETS = new RegExp(`^(${[
  String.raw`fn-(abs|ceiling|floor|round|string-length|substring|substring-before|substring-after)`,
  String.raw`fn-(upper-case|lower-case|starts-with|ends-with|contains|encode-for-uri|concat|matches|replace)`,
  String.raw`fn-((year|month|day)-from-(date|dateTime)|(hours|minutes|seconds)-from-(dateTime|time))`,
  String.raw`fn-(timezone-from-dateTime|not|true|false|boolean|string)`,
  String.raw`op-numeric-(add|subtract|multiply|divide|equal|less-than|greater-than|unary-minus|unary-plus)`,
  String.raw`op-(boolean|string|date|dateTime|time|duration|dayTimeDuration|yearMonthDuration)-.*`,
  String.raw`op-(add|subtract)-.*`,
  String.raw`prod-(CastExpr|ValueComp|GeneralComp\..*|OrExpr|IfExpr|Literal|ParenthesizedExpr)`,
  String.raw`xs-(double|float)`,
].join('|')})$`, 'u');

const QT3 = 'http://www.w3.org/2010/09/qt-fots-catalog';
const BF = new BindingsFactory(DF);

function parseArgs(argv) {
  const args = { cache: undefined, testSets: DEFAULT_TEST_SETS, skip: undefined, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '-c':
        args.cache = argv[++i];
        break;
      case '-t':
        args.testSets = new RegExp(argv[++i], 'u');
        break;
      case '--skip':
        args.skip = new RegExp(argv[++i], 'u');
        break;
      case '-v':
        args.verbose = true;
        break;
      default:
        throw new Error(`Unknown argument ${argv[i]}`);
    }
  }
  return args;
}

/**
 * Fetch a file of the test suite, using the cache directory if given.
 * @param {string} path The path within the test suite.
 * @param {string | undefined} cache The cache directory.
 */
async function fetchFile(path, cache) {
  const cacheFile = cache && join(cache, QT3_COMMIT, path.replaceAll('/', '__'));
  if (cacheFile) {
    try {
      return await readFile(cacheFile, 'utf8');
    } catch {
      // Not cached yet
    }
  }
  const response = await fetch(`${QT3_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Could not fetch ${path}: ${response.status}`);
  }
  const body = await response.text();
  if (cacheFile) {
    await mkdir(join(cache, QT3_COMMIT), { recursive: true });
    await writeFile(cacheFile, body);
  }
  return body;
}

/**
 * Parse an XML document into a minimal element tree.
 * @param {string} xml
 */
function parseXml(xml) {
  const parser = new SaxesParser({ xmlns: true });
  const root = { children: []};
  const stack = [ root ];
  parser.on('opentag', (node) => {
    const element = {
      name: node.local,
      namespace: node.uri,
      attributes: Object.fromEntries(Object.values(node.attributes).map(attr => [ attr.local, attr.value ])),
      children: [],
      text: '',
    };
    stack.at(-1).children.push(element);
    stack.push(element);
  });
  parser.on('closetag', () => stack.pop());
  parser.on('text', (text) => {
    stack.at(-1).text += text;
  });
  parser.on('cdata', (text) => {
    stack.at(-1).text += text;
  });
  parser.write(xml).close();
  return root.children[0];
}

function children(element, name) {
  return element.children.filter(child => child.namespace === QT3 && child.name === name);
}

/**
 * Determine whether a dependency is satisfied by an XPath 3.1 and XSD 1.1 implementation without extra features.
 * @returns {string | undefined} The reason why the dependency is not satisfied, if it is not.
 */
function unsatisfiedDependency(dependency) {
  const { type, value } = dependency.attributes;
  const expected = dependency.attributes.satisfied !== 'false';
  let satisfied;
  switch (type) {
    case 'spec':
      satisfied = value.split(/\s+/u).some((spec) => {
        const match = /^XP(\d\d)(\+?)$/u.exec(spec);
        return match && (match[1] === '31' || (match[2] === '+' && Number(match[1]) <= 31));
      });
      break;
    case 'xsd-version':
      satisfied = value === '1.1';
      break;
    default:
      // Optional features are not supported.
      satisfied = false;
  }
  return satisfied === expected ? undefined : `dependency ${type}=${value}`;
}

/**
 * Determine the algebra expressions of the variables of an environment.
 * @returns {Record<string, any> | string} The variables, or the reason why the environment is unsupported.
 */
function environmentVariables(environment) {
  const variables = {};
  for (const child of environment.children) {
    if (child.name !== 'param' || child.attributes.select === undefined) {
      return `environment with ${child.name}`;
    }
    try {
      variables[child.attributes.name] = xpathToAlgebra(child.attributes.select, variables);
    } catch (error) {
      if (error instanceof UnsupportedError) {
        return `environment parameter: ${error.message}`;
      }
      throw error;
    }
  }
  return variables;
}

class TestRunner {
  constructor() {
    this.engine = new ExpressionEngine();
    // The implicit timezone is implementation-defined, so it is fixed to make results reproducible.
    this.context = new ActionContext({
      [KeysExpressionEvaluator.defaultTimeZone.name]: { zoneHours: 0, zoneMinutes: 0 },
    });
    // Only built-in datatypes occur, so no other super types have to be discovered.
    this.superTypeProvider = { cache: new Map(), discoverer: () => 'term' };
    this.termTransformer = new TermTransformer(this.superTypeProvider);
  }

  /**
   * Evaluate an algebra expression to a term, or an error.
   */
  async evaluate(expression, bindings) {
    try {
      const evaluator = await this.engine.createEvaluator(expression, this.context);
      const term = await evaluator.evaluate(bindings ?? BF.bindings());
      // A typed literal is returned as is, while constructing a value with an invalid lexical form is an error.
      if (term.termType === 'Literal' && isNonLexicalLiteral(this.termTransformer.transformLiteral(term))) {
        return { error: new Error(`Invalid lexical form ${term.value} for ${term.datatype.value}`) };
      }
      return { term };
    } catch (error) {
      return { error };
    }
  }

  async evaluateEbv(expression, bindings) {
    try {
      const evaluator = await this.engine.createEvaluator(expression, this.context);
      return await evaluator.evaluateAsEBV(bindings ?? BF.bindings());
    } catch {
      return false;
    }
  }

  /**
   * Check a result against an assertion of the test suite.
   * @returns {Promise<'pass' | 'fail' | 'unsupported'>} Whether the result satisfies the assertion.
   */
  async check(assertion, result, variables) {
    const text = assertion.text.trim();
    switch (assertion.name) {
      case 'error':
        return result.error ? 'pass' : 'fail';
      case 'all-of':
      case 'any-of': {
        const outcomes = [];
        for (const child of assertion.children) {
          outcomes.push(await this.check(child, result, variables));
        }
        if (assertion.name === 'all-of') {
          return outcomes.includes('fail') ? 'fail' : (outcomes.includes('unsupported') ? 'unsupported' : 'pass');
        }
        return outcomes.includes('pass') ? 'pass' : (outcomes.includes('unsupported') ? 'unsupported' : 'fail');
      }
      case 'not': {
        const outcome = await this.check(assertion.children[0], result, variables);
        return outcome === 'unsupported' ? outcome : (outcome === 'pass' ? 'fail' : 'pass');
      }
    }
    if (result.error) {
      return 'fail';
    }
    const term = result.term;
    switch (assertion.name) {
      case 'assert-true':
      case 'assert-false':
        return term.termType === 'Literal' && term.datatype.value === `${XSD}boolean` &&
          [ 'true', '1' ].includes(term.value) === (assertion.name === 'assert-true') ?
          'pass' :
          'fail';
      case 'assert-eq':
      case 'assert-deep-eq': {
        let expected;
        try {
          expected = xpathToAlgebra(text, variables);
        } catch (error) {
          if (error instanceof UnsupportedError) {
            return 'unsupported';
          }
          throw error;
        }
        const expectedResult = await this.evaluate(expected);
        if (expectedResult.error) {
          return 'unsupported';
        }
        // Deep equality considers NaN equal to itself
        if (assertion.name === 'assert-deep-eq' && term.value === 'NaN' && expectedResult.term.value === 'NaN') {
          return 'pass';
        }
        const equal = await this.evaluateEbv(AF.createOperatorExpression('=', [
          AF.createTermExpression(term),
          AF.createTermExpression(expectedResult.term),
        ]));
        return equal ? 'pass' : 'fail';
      }
      case 'assert-string-value': {
        let actual = term.value;
        if (term.termType === 'Literal' && term.datatype.value !== `${XSD}string` && !term.language) {
          const cast = await this.evaluate(AF.createNamedExpression(DF.namedNode(`${XSD}string`), [
            AF.createTermExpression(term),
          ]));
          if (cast.error) {
            return 'fail';
          }
          actual = cast.term.value;
        }
        let expected = assertion.text;
        if (assertion.attributes['normalize-space'] === 'true') {
          actual = actual.replaceAll(/\s+/gu, ' ').trim();
          expected = expected.replaceAll(/\s+/gu, ' ').trim();
        }
        return actual === expected ? 'pass' : 'fail';
      }
      case 'assert-type': {
        const match = /^xs:(\w+)$/u.exec(text);
        if (!match || term.termType !== 'Literal') {
          return 'unsupported';
        }
        if (match[1] === 'anyAtomicType') {
          return 'pass';
        }
        return isSubTypeOf(term.datatype.value, `${XSD}${match[1]}`, this.superTypeProvider) ? 'pass' : 'fail';
      }
      case 'assert': {
        let expression;
        try {
          expression = xpathToAlgebra(text, { ...variables, result: AF.createTermExpression(DF.variable('result')) });
        } catch (error) {
          if (error instanceof UnsupportedError) {
            return 'unsupported';
          }
          throw error;
        }
        return await this.evaluateEbv(expression, BF.fromRecord({ result: term })) ? 'pass' : 'fail';
      }
      default:
        return 'unsupported';
    }
  }

  /**
   * Run a single test case.
   * @returns {Promise<{ outcome: 'pass' | 'fail' | 'skip', reason?: string, result?: any }>} The outcome.
   */
  async run(testCase, environments, testSetDependencies) {
    for (const dependency of [ ...testSetDependencies, ...children(testCase, 'dependency') ]) {
      const reason = unsatisfiedDependency(dependency);
      if (reason) {
        return { outcome: 'skip', reason };
      }
    }

    let variables = {};
    for (const environment of children(testCase, 'environment')) {
      const named = environment.attributes.ref;
      if (named === 'empty') {
        continue;
      }
      const definition = named ? environments[named] : environment;
      if (!definition) {
        return { outcome: 'skip', reason: `environment ${named}` };
      }
      variables = environmentVariables(definition);
      if (typeof variables === 'string') {
        return { outcome: 'skip', reason: variables };
      }
    }

    const test = children(testCase, 'test')[0];
    if (!test || test.attributes.file) {
      return { outcome: 'skip', reason: 'test in a separate file' };
    }
    let expression;
    try {
      expression = xpathToAlgebra(test.text, variables);
    } catch (error) {
      if (error instanceof UnsupportedError) {
        return { outcome: 'skip', reason: 'expression not expressible in SPARQL' };
      }
      throw error;
    }

    const result = await this.evaluate(expression);
    const assertion = children(testCase, 'result')[0].children[0];
    const outcome = await this.check(assertion, result, variables);
    if (outcome === 'unsupported') {
      return { outcome: 'skip', reason: `assertion ${assertion.name}` };
    }
    return { outcome, result };
  }
}

function describeResult(result) {
  if (result.error) {
    return `error: ${result.error.message.split('\n')[0]}`;
  }
  const term = result.term;
  return term.termType === 'Literal' ? `"${term.value}"^^<${term.datatype.value}>` : `<${term.value}>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = parseXml(await fetchFile('catalog.xml', args.cache));
  const environments = Object.fromEntries(children(catalog, 'environment')
    .map(environment => [ environment.attributes.name, environment ]));
  const runner = new TestRunner();

  const knownFailureReasons = new Map(knownFailures
    .flatMap(({ reason, tests }) => tests.map(test => [ test, reason ])));
  const failures = [];
  const fixed = [];
  const skipReasons = {};
  let passed = 0;
  let skipped = 0;
  let failedAsKnown = 0;
  for (const testSet of children(catalog, 'test-set')) {
    if (!args.testSets.test(testSet.attributes.name)) {
      continue;
    }
    const testSetXml = parseXml(await fetchFile(testSet.attributes.file, args.cache));
    const testSetEnvironments = {
      ...environments,
      ...Object.fromEntries(children(testSetXml, 'environment')
        .map(environment => [ environment.attributes.name, environment ])),
    };
    const testSetDependencies = children(testSetXml, 'dependency');
    for (const testCase of children(testSetXml, 'test-case')) {
      const name = testCase.attributes.name;
      const { outcome, reason, result } = args.skip?.test(name) ?
          { outcome: 'skip', reason: 'skipped by argument' } :
        await runner.run(testCase, testSetEnvironments, testSetDependencies);
      if (outcome === 'pass') {
        passed++;
        if (knownFailureReasons.has(name)) {
          fixed.push(name);
        }
      } else if (outcome === 'skip') {
        skipped++;
        skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      } else if (knownFailureReasons.has(name)) {
        failedAsKnown++;
        if (args.verbose) {
          process.stdout.write(`- ${testSet.attributes.name} ${name} (known: ${knownFailureReasons.get(name)})\n`);
        }
      } else {
        failures.push({ testSet: testSet.attributes.name, name, testCase, result });
      }
    }
  }

  for (const { testSet, name, testCase, result } of failures) {
    const result_ = children(testCase, 'result')[0];
    process.stdout.write(`✖ ${testSet} ${name}\n`);
    process.stdout.write(`    Test:     ${children(testCase, 'test')[0].text.trim().replaceAll(/\s+/gu, ' ')}\n`);
    process.stdout.write(`    Expected: ${serializeAssertion(result_.children[0])}\n`);
    process.stdout.write(`    Actual:   ${describeResult(result)}\n`);
  }
  if (args.verbose) {
    for (const [ reason, count ] of Object.entries(skipReasons).sort(([ , a ], [ , b ]) => b - a)) {
      process.stdout.write(`  skipped ${count}: ${reason}\n`);
    }
  }
  for (const name of fixed) {
    process.stdout.write(`\u2714 ${name} passes, so it can be removed from the known failures\n`);
  }
  process.stdout.write(`${passed} passed, ${failures.length} failed, ${failedAsKnown} known failures, ${skipped} skipped\n`);
  process.exitCode = failures.length > 0 ? 1 : 0;
}

function serializeAssertion(assertion) {
  const content = assertion.children.length > 0 ?
    assertion.children.map(child => serializeAssertion(child)).join(', ') :
      (assertion.attributes.code ?? assertion.text.trim());
  return `${assertion.name}(${content})`;
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
