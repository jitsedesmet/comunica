#!/usr/bin/env node
/* eslint-disable import/no-nodejs-modules, no-sync */
// Runs RML test cases, such as https://github.com/kg-construct/rml-core/tree/main/test-cases
// Usage: node spec/rml-test-cases.js <test cases> [regex of test case names to skip]
// The test cases are a local directory, or <git repository URL>#<commit>:<directory in the repository>
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Parser, Writer } = require('n3');
const { isomorphic } = require('rdf-isomorphic');
const { QueryEngine } = require('..');

const DEFAULT_BASE_IRI = 'http://example.com/';

/**
 * Normalize serialized quads for a comparison that ignores their order.
 * @param {string} serializedQuads Quads in N-Quads, one per line.
 * @return {string} The non-empty lines in sorted order.
 */
function toSortedLines(serializedQuads) {
  return serializedQuads.split('\n').map(line => line.trim()).filter(Boolean).sort().join('\n');
}

/**
 * Run a single test case.
 * @param {string} testCaseDirectory The directory with the mapping, its inputs and its expected output.
 * @return {Promise<string | undefined>} Why the test case failed, or undefined if it passed.
 */
async function runTestCase(testCaseDirectory) {
  const expectedOutputPath = path.join(testCaseDirectory, 'output.nq');
  // A test case without expected output expects the mapping to be rejected
  const expectsError = !fs.existsSync(expectedOutputPath);
  let quads;
  try {
    const quadStream = await new QueryEngine().queryQuads(
      fs.readFileSync(path.join(testCaseDirectory, 'mapping.ttl'), 'utf8'),
      {
        sources: [],
        queryFormat: { language: 'rml', version: '1.0' },
        baseIRI: DEFAULT_BASE_IRI,
        '@comunica/actor-query-parse-rml:mappingDirectory': `${pathToFileURL(testCaseDirectory).href}/`,
      },
    );
    quads = await quadStream.toArray();
  } catch (error) {
    return expectsError ? undefined : `unexpected error: ${error.message.split('\n')[0]}`;
  }
  if (expectsError) {
    return `expected an error, but got ${quads.length} quads`;
  }
  const expectedOutput = fs.readFileSync(expectedOutputPath, 'utf8');
  let isExpectedOutput;
  try {
    isExpectedOutput = isomorphic(quads, new Parser({ format: 'N-Quads' }).parse(expectedOutput));
  } catch {
    // Expected output with unsafe IRIs is not valid N-Quads, so its lines are compared instead
    isExpectedOutput = toSortedLines(new Writer({ format: 'N-Quads' }).quadsToString(quads)) ===
      toSortedLines(expectedOutput);
  }
  return isExpectedOutput ? undefined : `got ${quads.length} quads that differ from the expected output`;
}

/**
 * Get the directory of the test cases, fetching them from a git repository if needed.
 * @param {string} testCases A local directory, or <git repository URL>#<commit>:<directory in the repository>.
 * @return {string} The local directory with the test cases.
 */
function getTestCasesDirectory(testCases) {
  const [ , repositoryUrl, commit, directory ] = /^(https?:.+)#([\da-f]+):(.+)$/u.exec(testCases) ?? [];
  if (!repositoryUrl) {
    return testCases;
  }
  // The cache is shared with the other specification tests, and is kept between CI runs
  const checkout = path.join(__dirname, '../../../.rdf-test-suite-cache', `rml-test-cases-${commit}`);
  if (!fs.existsSync(path.join(checkout, directory))) {
    fs.rmSync(checkout, { recursive: true, force: true });
    fs.mkdirSync(checkout, { recursive: true });
    const git = args => execFileSync('git', args, { cwd: checkout, stdio: 'ignore' });
    git([ 'init' ]);
    git([ 'fetch', '--depth', '1', repositoryUrl, commit ]);
    git([ 'checkout', 'FETCH_HEAD' ]);
  }
  return path.join(checkout, directory);
}

(async() => {
  const [ testCases, skipPattern ] = process.argv.slice(2);
  if (!testCases) {
    throw new Error('Usage: rml-test-cases.js <test cases> [regex of test case names to skip]');
  }
  const testCasesDirectory = getTestCasesDirectory(testCases);
  const testCaseNames = fs.readdirSync(testCasesDirectory)
    .filter(name => fs.existsSync(path.join(testCasesDirectory, name, 'mapping.ttl')));
  const skippedTestCaseNames = testCaseNames.filter(name => skipPattern && new RegExp(skipPattern, 'u').test(name));

  const failures = [];
  for (const testCaseName of testCaseNames.filter(name => !skippedTestCaseNames.includes(name))) {
    const failure = await runTestCase(path.resolve(testCasesDirectory, testCaseName));
    process.stdout.write(`${failure ? '✖' : '✔'} ${testCaseName}${failure ? `: ${failure}` : ''}\n`);
    if (failure) {
      failures.push(testCaseName);
    }
  }
  const passedCount = testCaseNames.length - skippedTestCaseNames.length - failures.length;
  process.stdout.write(`${passedCount} / ${testCaseNames.length} RML test cases passed, ${
    skippedTestCaseNames.length} skipped, ${failures.length} failed\n`);
  process.exitCode = failures.length > 0 ? 1 : 0;
})();
