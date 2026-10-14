#!/usr/bin/env node
/* eslint-disable ts/no-var-requires, ts/no-require-imports, no-sync, no-console, import/no-nodejs-modules, import/extensions -- standalone Node.js measurement scripts */
/**
 * Complements measure-federated.js with a deterministic comparison of the query planning.
 * Since @comunica/actor-optimize-query-operation-prune-empty-source-operations only affects the logical optimization,
 * this records for each query and variant the optimized logical plan (as produced by `explain(..., 'logical')`),
 * together with the HTTP requests that were needed for planning (source discovery, COUNT and ASK queries).
 * This allows comparing both variants independently of the (often unreliable) execution over remote endpoints.
 *
 * Usage: node measure-federated-plans.js [--base <git-ref>] [--reps <n>] [--filter <regex>] [--timeout <ms>] [--warmup <n>]
 *                                         [--cache <dir>|off]
 * HTTP responses are cached on disk in the same way as in measure-federated.js (default: .measure-federated-cache).
 * Each variant is planned <n> times (default 3), interleaved in alternating order,
 * as the number of planning requests depends on the response times of the endpoints.
 * Before that, each variant is planned <warmup> times (default 1) and discarded, as COUNT queries against cold endpoints
 * may exceed their timeout, which causes additional ASK queries to be sent.
 * Must be run after measure-federated.js, as it adds `logicalPlan` entries to measurements-{before,after}.json
 * for the successful planning runs, and `logicalPlanFailures` entries to measurements-failed.json for the failed ones.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.argv[2] === '--child') {
  runChild();
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function main() {
  const { parseArgs, loadQueries, transpileBeforeActor, runWhenNetworkAvailable } = require('./measure-federated.js');
  const { DEFAULT_CACHE_DIR } = require('./measure-federated-cache.js');
  const args = parseArgs();
  const timeoutMs = Number.parseInt(args.timeout ?? '300000', 10);
  const reps = Number.parseInt(args.reps ?? '3', 10);
  const warmup = Number.parseInt(args.warmup ?? '1', 10);
  const cacheDir = args.cache === 'off' ? undefined : path.resolve(args.cache ?? DEFAULT_CACHE_DIR);
  const tmpDir = fs.mkdtempSync(path.join(__dirname, '.measure-federated-tmp-'));
  const variants = { before: transpileBeforeActor(tmpDir, args.base), after: undefined };
  const queries = await loadQueries(args.filter);

  const outputs = {};
  for (const variant of [ ...Object.keys(variants), 'failed' ]) {
    outputs[variant] = JSON.parse(fs.readFileSync(path.join(__dirname, `measurements-${variant}.json`), 'utf8'));
  }
  for (const { name, sources, query } of queries) {
    console.error(`# ${name}`);
    const plans = { before: [], after: []};
    const order = rep => rep % 2 === 0 ? [ 'before', 'after' ] : [ 'after', 'before' ];
    for (let rep = 0; rep < warmup; rep++) {
      for (const variant of order(rep)) {
        const plan = await runWhenNetworkAvailable(sources, () =>
          runChildProcess({ query, sources, actorOverride: variants[variant], timeoutMs, cacheDir }, tmpDir));
        console.error(`  (warm-up, discarded) ${variant}: ${plan.planningRequests} planning requests${plan.error ? ` (error: ${plan.error})` : ''}`);
      }
    }
    for (let rep = 0; rep < reps; rep++) {
      for (const variant of order(rep)) {
        const plan = await runWhenNetworkAvailable(sources, () =>
          runChildProcess({ query, sources, actorOverride: variants[variant], timeoutMs, cacheDir }, tmpDir));
        plans[variant].push(plan);
        console.error(`  ${variant} #${rep + 1}: ${plan.planningRequests} planning requests${plan.cache ? ` (${plan.cache.misses} cache misses)` : ''}${plan.error ? ` (error: ${plan.error})` : ''}`);
      }
    }
    // Planning runs that failed (due to unavailable endpoints) are stored separately
    const successful = Object.fromEntries(Object.entries(plans)
      .map(([ variant, variantPlans ]) => [ variant, variantPlans.filter(plan => plan.plan !== undefined) ]));
    const distinctPlans = new Set(Object.values(successful).flat().map(plan => plan.plan));
    const identical = Object.values(successful).every(variantPlans => variantPlans.length > 0) && distinctPlans.size === 1;
    console.error(`  identical plans: ${identical}`);
    outputs.failed.queries[name] ??= { sources, query };
    for (const variant of Object.keys(variants)) {
      const [ first ] = successful[variant];
      outputs[variant].queries[name] ??= { sources, query };
      outputs[variant].queries[name].logicalPlan = {
        identicalAcrossSuccessfulRunsOfBothVariants: identical,
        discardedWarmupRuns: warmup,
        successfulRuns: successful[variant].length,
        failedRuns: plans[variant].length - successful[variant].length,
        planningRequests: successful[variant].map(plan => plan.planningRequests),
        planningCacheMisses: successful[variant].map(plan => plan.cache?.misses ?? null),
        plan: first?.plan,
        // Request URLs are only kept for the first run to keep the files readable
        planningRequestUrls: first?.planningRequestUrls,
      };
      outputs.failed.queries[name][variant] ??= { runs: []};
      outputs.failed.queries[name][variant].logicalPlanFailures = plans[variant]
        .filter(plan => plan.plan === undefined)
        .map(({ planningRequestUrls: _planningRequestUrls, ...plan }) => plan);
    }
  }
  for (const [ variant, output ] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(__dirname, `measurements-${variant}.json`), `${JSON.stringify(output, null, 2)}\n`);
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function runChildProcess(job, tmpDir) {
  const jobFile = path.join(tmpDir, `plan-job-${process.hrtime.bigint()}.json`);
  fs.writeFileSync(jobFile, JSON.stringify(job));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ __filename, '--child', jobFile ], { cwd: __dirname });
    // The output is written to a file, but the pipes must be drained to avoid blocking the child
    child.stdout.resume();
    const kill = setTimeout(() => child.kill('SIGKILL'), job.timeoutMs);
    child.on('close', () => {
      clearTimeout(kill);
      fs.rmSync(jobFile, { force: true });
      try {
        resolve(JSON.parse(fs.readFileSync(`${jobFile}.out`, 'utf8')));
        fs.rmSync(`${jobFile}.out`, { force: true });
      } catch {
        resolve({ error: 'No plan could be produced (timeout or crash)', planningRequests: null });
      }
    });
  });
}

async function runChild() {
  const Module = require('node:module');
  const jobFile = process.argv[3];
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const ACTOR_FILE = path.resolve(__dirname, 'packages/actor-optimize-query-operation-prune-empty-source-operations/lib/ActorOptimizeQueryOperationPruneEmptySourceOperations.js');
  if (job.actorOverride) {
    const originalResolve = Module._resolveFilename;
    Module._resolveFilename = function(...args) {
      const resolved = originalResolve.apply(this, args);
      return resolved === ACTOR_FILE ? path.resolve(job.actorOverride) : resolved;
    };
  }
  const { QueryEngine } = require('./engines/query-sparql');

  const { createCachingFetch } = require('./measure-federated-cache.js');
  const { fetch: cachingFetch, stats: cacheStats } = createCachingFetch(job.cacheDir);
  const requests = [];
  const fetchCounting = (input, init) => {
    requests.push(`${init?.method ?? 'GET'} ${typeof input === 'string' ? input : input.url}`);
    return cachingFetch(input, init);
  };
  const output = {};
  try {
    const { data } = await new QueryEngine().explain(job.query, { sources: job.sources, fetch: fetchCounting }, 'logical');
    output.plan = formatOperation(data);
  } catch (error) {
    output.error = String(error?.message ?? error).split('\n')[0].slice(0, 500);
  }
  output.planningRequests = requests.length;
  output.cache = job.cacheDir ? cacheStats : null;
  output.planningRequestUrls = requests;
  fs.writeFileSync(`${jobFile}.out`, JSON.stringify(output));
  process.exit(0);
}

/**
 * Compact textual representation of an algebra operation, including the sources that operations are assigned to.
 */
function formatOperation(op) {
  if (op === null || op === undefined || typeof op !== 'object') {
    return String(op);
  }
  if (Array.isArray(op)) {
    return `[${op.map(formatOperation).join(', ')}]`;
  }
  if (op.termType && op.termType !== 'Quad') {
    switch (op.termType) {
      case 'Variable': return `?${op.value}`;
      case 'NamedNode': return `<${op.value}>`;
      case 'Literal': return JSON.stringify(op.value);
      default: return `${op.termType}(${op.value})`;
    }
  }
  const source = op.metadata?.scopedSource?.source?.referenceValue;
  const suffix = source ? `@<${source}>` : '';
  const fields = Object.entries(op)
    .filter(([ key ]) => key !== 'type' && key !== 'metadata' && key !== 'termType' && key !== 'value')
    .map(([ key, value ]) => `${key}=${formatOperation(value)}`);
  return `${op.type ?? op.termType ?? ''}${suffix}{${fields.join(' ')}}`;
}
