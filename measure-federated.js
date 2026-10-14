#!/usr/bin/env node
/* eslint-disable ts/no-var-requires, ts/no-require-imports, no-sync, no-console, import/no-nodejs-modules, import/extensions -- standalone Node.js measurement scripts */
/**
 * Measures the number of HTTP requests and execution time of the federated queries of https://query.comunica.dev/,
 * before and after the changes to @comunica/actor-optimize-query-operation-prune-empty-source-operations.
 *
 * Usage: node measure-federated.js [--base <git-ref>] [--reps <n>] [--timeout <ms>] [--filter <regex>]
 *                                   [--warmup <n>] [--warmup-timeout <ms>] [--cache <dir>|off]
 *
 * - "after" is the actor as currently compiled in this checkout (run `yarn build` first).
 * - "before" is the actor at <base> (default: the merge base with master), transpiled into a temporary file
 *   that replaces the compiled actor in the child process.
 * Both variants are executed interleaved (before, after, before, after, ...), each run in a fresh process,
 * so that fluctuations of the remote endpoints affect both variants equally.
 * Before the measured runs of each query, both variants are executed <warmup> times (default 1) and discarded,
 * as the first runs against cold endpoints are slower, which causes COUNT queries to exceed their timeout,
 * which in turn causes additional ASK queries to be sent.
 * By default, all HTTP responses are cached on disk (in .measure-federated-cache, see measure-federated-cache.js),
 * so that only the first (warm-up) runs reach the live servers, and the measured runs are independent of the
 * availability and response times of the remote endpoints. The cache hits and misses of each run are recorded.
 * Use `--cache off` to always query the live servers.
 * The successful runs are written to measurements-before.json and measurements-after.json,
 * while failed, timed out, and crashed runs (which only have partial measurements) are written to measurements-failed.json.
 * Afterwards, run measure-federated-plans.js to add the optimized logical plans of both variants to these files.
 */
const { execFileSync, spawn } = require('node:child_process');
const dns = require('node:dns/promises');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const { DEFAULT_CACHE_DIR } = require('./measure-federated-cache.js');

function parseArgs() {
  return Object.fromEntries(process.argv.slice(2).reduce((acc, arg, i, all) =>
    arg.startsWith('--') ? [ ...acc, [ arg.slice(2), all[i + 1] ]] : acc, []));
}
const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: __dirname, encoding: 'utf8' }).trim();
const resolveBase = base => git('rev-parse', base ?? git('merge-base', 'master', 'HEAD'));

// The queries of https://query.comunica.dev/, pinned to a commit of https://github.com/comunica/jQuery-Widget.js
const WIDGET_REPO = 'https://raw.githubusercontent.com/comunica/jQuery-Widget.js/c256d8a8259d7754e708c430e06775e4fff3fe55';
const QUERIES = [
  'federation/rhea-arachidonate.sparql',
  'federation/rhea-enzymes-transporters.sparql',
  'federation/rhea-organism.sparql',
  'federation/wikidata-dbpedia-cats.sparql',
  'heterogeneous/betweenourworlds.sparql',
  'heterogeneous/claimants-spratly-islands.sparql',
  'heterogeneous/closed-stations.sparql',
  'heterogeneous/common-interests.sparql',
  'heterogeneous/disputed-territories.sparql',
  'heterogeneous/ruben-interests.sparql',
  'heterogeneous/younger-than-ruben.sparql',
];
const ACTOR_PATH = 'packages/actor-optimize-query-operation-prune-empty-source-operations/lib/ActorOptimizeQueryOperationPruneEmptySourceOperations';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchText(url, attempts = 10) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Could not fetch ${url}: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      if (attempt >= attempts) {
        throw error;
      }
      console.error(`Fetching ${url} failed (${error.message}), retrying in 30 s`);
      await sleep(30_000);
    }
  }
}

/**
 * Checks if the hosts of all sources can be resolved, to detect outages of the network of this machine,
 * which would otherwise be recorded as failed runs.
 */
async function isNetworkAvailable(sources) {
  try {
    await Promise.all(sources.map(source => dns.lookup(new URL(source).hostname)));
    return true;
  } catch {
    return false;
  }
}

async function waitForNetwork(sources, maxWaitMs = 3_600_000) {
  const start = Date.now();
  while (!await isNetworkAvailable(sources)) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error(`Network unavailable for more than ${maxWaitMs} ms`);
    }
    console.error('  network unavailable, waiting 30 s');
    await sleep(30_000);
  }
}

/**
 * Executes a run once the network is available,
 * and repeats it (at most 3 times) if it failed while the network of this machine went down.
 */
async function runWhenNetworkAvailable(sources, runner) {
  for (let attempt = 1; ; attempt++) {
    await waitForNetwork(sources);
    const result = await runner();
    const failed = result.error || result.timedOut;
    if (!failed || attempt >= 3 || await isNetworkAvailable(sources)) {
      return result;
    }
    console.error(`  network went down during the run (${result.error ?? 'timeout'}), repeating it`);
  }
}

/**
 * Prepare a query like the web client does:
 * resolve the datasource patterns of its header to the first matching datasource of the settings,
 * and add the predefined prefixes that are not declared by the query.
 */
function prepareQuery(name, text, settings) {
  const header = /^#\s*Datasources?:\s*(.*)$/mu.exec(text);
  const sources = header[1].trim().split(/\s+/u).map((pattern) => {
    const regex = new RegExp(`^${pattern.replaceAll('.', '\\.').replaceAll('*', '.*')}$`, 'u');
    const match = settings.datasources.map(datasource => datasource.url).find(url => regex.test(url)) ?? pattern;
    return match.startsWith('//') ? `https:${match}` : match;
  });
  const prefixes = Object.entries(settings.prefixes)
    .filter(([ prefix ]) => !new RegExp(`PREFIX\\s+${prefix}:`, 'iu').test(text))
    .map(([ prefix, iri ]) => `PREFIX ${prefix}: <${iri}>\n`)
    .join('');
  return { name, sources, query: prefixes + text };
}

async function loadQueries(filter) {
  const regex = filter ? new RegExp(filter, 'u') : undefined;
  const settings = JSON.parse(await fetchText(`${WIDGET_REPO}/settings.json`));
  const queries = [];
  for (const name of QUERIES.filter(name => !regex || regex.test(name))) {
    queries.push(prepareQuery(name, await fetchText(`${WIDGET_REPO}/queries/${name}`), settings));
  }
  return queries;
}

function transpileBeforeActor(dir, base) {
  const source = git('show', `${resolveBase(base)}:${ACTOR_PATH}.ts`);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const file = path.join(dir, 'ActorOptimizeQueryOperationPruneEmptySourceOperations.before.js');
  fs.writeFileSync(file, outputText);
  return file;
}

function runOnce(job, tmpDir) {
  const id = process.hrtime.bigint();
  const jobFile = path.join(tmpDir, `job-${id}.json`);
  const outputFile = path.join(tmpDir, `output-${id}.json`);
  fs.writeFileSync(jobFile, JSON.stringify(job));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ path.join(__dirname, 'measure-federated-run.js'), jobFile, outputFile ], {
      cwd: __dirname,
      stdio: [ 'ignore', 'ignore', 'pipe' ],
    });
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    // Safety net in case the child does not terminate by itself
    const kill = setTimeout(() => child.kill('SIGKILL'), job.timeoutMs + 30_000);
    child.on('close', (code, signal) => {
      clearTimeout(kill);
      let result;
      try {
        result = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      } catch {
        result = { requests: null, totalTimeMs: null };
      }
      if (result.partial || code !== 0) {
        const reason = /heap out of memory|heap limit/u.test(stderr) ? 'out of memory' : `exit code ${code}, signal ${signal}`;
        result.error = `Process crashed (${reason}); measurements are partial`;
      }
      fs.rmSync(jobFile, { force: true });
      fs.rmSync(outputFile, { force: true });
      resolve(result);
    });
  });
}

function median(values) {
  const sorted = values.filter(v => typeof v === 'number').sort((a, b) => a - b);
  if (sorted.length === 0) {
    return null;
  }
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function mean(values) {
  const numbers = values.filter(v => typeof v === 'number');
  return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
}
const round = value => value === null ? null : Math.round(value * 10) / 10;

function stats(values) {
  return {
    median: round(median(values)),
    mean: round(mean(values)),
    min: values.length > 0 ? round(Math.min(...values)) : null,
    max: values.length > 0 ? round(Math.max(...values)) : null,
  };
}

const isSuccessful = run => !run.error && !run.timedOut;

/**
 * Summarize the successful runs of a query.
 */
function summarize(runs) {
  return {
    successfulRuns: runs.length,
    ...runs.length > 0 ?
        {
          results: [ ...new Set(runs.map(run => run.results)) ],
          requests: stats(runs.map(run => run.requests)),
          totalTimeMs: stats(runs.map(run => run.totalTimeMs)),
          timeToFirstResultMs: stats(runs.map(run => run.timeToFirstResultMs).filter(t => t !== null)),
          // Requests that were not served from the HTTP cache, but sent to the live servers
          cacheMisses: runs.map(run => run.cache?.misses ?? null),
        } :
        { note: 'No run was successful, see measurements-failed.json.' },
  };
}

function formatRuns(runs) {
  return runs.map(({ requestUrls, ...run }, idx) => ({
    ...run,
    totalTimeMs: round(run.totalTimeMs),
    timeToFirstResultMs: round(run.timeToFirstResultMs),
    // Request URLs are only kept for the first run to keep the files readable
    ...requestUrls && idx === 0 ? { requestUrls: requestUrls.map(r => `${r.method} ${r.url}`) } : {},
  }));
}

async function main() {
  const args = parseArgs();
  const REPS = Number.parseInt(args.reps ?? '5', 10);
  const TIMEOUT_MS = Number.parseInt(args.timeout ?? '120000', 10);
  const WARMUP = Number.parseInt(args.warmup ?? '1', 10);
  const CACHE_DIR = args.cache === 'off' ? undefined : path.resolve(args.cache ?? DEFAULT_CACHE_DIR);
  const WARMUP_TIMEOUT_MS = Number.parseInt(args['warmup-timeout'] ?? String(Math.min(TIMEOUT_MS, 60000)), 10);
  const BASE = resolveBase(args.base);
  const HEAD = git('rev-parse', 'HEAD');
  // Located within the repository, so that the transpiled actor can resolve its @comunica dependencies
  const tmpDir = fs.mkdtempSync(path.join(__dirname, '.measure-federated-tmp-'));
  const beforeActor = transpileBeforeActor(tmpDir, BASE);
  const queries = await loadQueries(args.filter);

  const variants = {
    before: { commit: BASE, actorOverride: beforeActor },
    after: { commit: HEAD, actorOverride: undefined },
  };
  const metadata = {
    date: new Date().toISOString(),
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    repetitions: REPS,
    timeoutMs: TIMEOUT_MS,
    discardedWarmupRunsPerVariant: WARMUP,
    warmupTimeoutMs: WARMUP_TIMEOUT_MS,
    httpCache: CACHE_DIR ? path.relative(__dirname, CACHE_DIR) : null,
    queriesSource: WIDGET_REPO,
  };
  const outputs = {};
  for (const [ variant, { commit }] of Object.entries(variants)) {
    outputs[variant] = { variant, commit, ...metadata, queries: {}};
  }
  // Failed, timed out, and crashed runs are only partial measurements, so they are kept separately
  const failed = {
    description: 'Runs that failed, timed out, or crashed; their measurements are partial.',
    commits: { before: BASE, after: HEAD },
    ...metadata,
    queries: {},
  };

  for (const { name, sources, query } of queries) {
    console.error(`# ${name} (${sources.join(' ')})`);
    const runs = { before: [], after: []};
    for (let rep = 0; rep < WARMUP; rep++) {
      for (const variant of rep % 2 === 0 ? [ 'before', 'after' ] : [ 'after', 'before' ]) {
        const run = await runWhenNetworkAvailable(sources, () =>
          runOnce({ query, sources, timeoutMs: WARMUP_TIMEOUT_MS, actorOverride: variants[variant].actorOverride, cacheDir: CACHE_DIR }, tmpDir));
        console.error(`  (warm-up, discarded) ${variant}: ${run.requests} requests, ${round(run.totalTimeMs)} ms${run.timedOut ? ' (timeout)' : ''}${run.error ? ` (error: ${run.error})` : ''}`);
      }
    }
    for (let rep = 0; rep < REPS; rep++) {
      // Alternate the order of the variants to avoid systematically favoring one
      const order = rep % 2 === 0 ? [ 'before', 'after' ] : [ 'after', 'before' ];
      for (const variant of order) {
        const run = await runWhenNetworkAvailable(sources, () =>
          runOnce({ query, sources, timeoutMs: TIMEOUT_MS, actorOverride: variants[variant].actorOverride, cacheDir: CACHE_DIR }, tmpDir));
        if (!run.error && run.variantCheck !== variant) {
          throw new Error(`Expected variant ${variant}, but ${run.variantCheck} was loaded`);
        }
        runs[variant].push(run);
        console.error(`  ${variant} #${rep + 1}: ${run.requests} requests${run.cache ? `, ${run.cache.misses} cache misses` : ''}, ${round(run.totalTimeMs)} ms, ${run.results} results${run.timedOut ? ' (timeout)' : ''}${run.error ? ` (error: ${run.error})` : ''}`);
      }
    }
    failed.queries[name] = { sources, query };
    for (const variant of Object.keys(variants)) {
      const successfulRuns = runs[variant].filter(isSuccessful);
      const failedRuns = runs[variant].filter(run => !isSuccessful(run));
      outputs[variant].queries[name] = {
        sources,
        query,
        summary: { ...summarize(successfulRuns), failedRuns: failedRuns.length },
        runs: formatRuns(successfulRuns),
      };
      failed.queries[name][variant] = { runs: formatRuns(failedRuns) };
    }
  }

  for (const [ variant, output ] of Object.entries({ ...outputs, failed })) {
    const file = path.join(__dirname, `measurements-${variant}.json`);
    fs.writeFileSync(file, `${JSON.stringify(output, null, 2)}\n`);
    console.error(`Wrote ${file}`);
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

module.exports = { parseArgs, loadQueries, transpileBeforeActor, summarize, runWhenNetworkAvailable };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
