#!/usr/bin/env node
/* eslint-disable ts/no-var-requires, ts/no-require-imports, no-sync, import/no-nodejs-modules, import/no-extraneous-dependencies, import/extensions, ts/explicit-member-accessibility -- standalone Node.js measurement scripts */
/**
 * Executes a single query in a fresh process and prints the measurements as JSON on stdout.
 *
 * Usage: node measure-federated-run.js <job-json-file> <output-json-file>
 * The job file contains: { query, sources, timeoutMs, actorOverride?, cacheDir? }
 * If cacheDir is set, HTTP responses are served from (and stored in) that on-disk cache (see measure-federated-cache.js).
 * While running, a partial result is written to the output file every second,
 * so that the number of requests is still known if the process crashes (e.g., when running out of memory).
 * If actorOverride is set, the compiled prune-empty-source-operations actor is replaced by that file,
 * which allows the "before" and "after" variants to be measured interleaved on the same build.
 */
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outputFile = process.argv[3];

const ACTOR_FILE = path.resolve(__dirname, 'packages/actor-optimize-query-operation-prune-empty-source-operations/lib/ActorOptimizeQueryOperationPruneEmptySourceOperations.js');
if (job.actorOverride) {
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function(...args) {
    const resolved = originalResolve.apply(this, args);
    return resolved === ACTOR_FILE ? path.resolve(job.actorOverride) : resolved;
  };
}

const { ActorOptimizeQueryOperationPruneEmptySourceOperations } =
  require('@comunica/actor-optimize-query-operation-prune-empty-source-operations');
const { Logger } = require('@comunica/types');
const { QueryEngine } = require('./engines/query-sparql');

const { createCachingFetch } = require('./measure-federated-cache.js');

const { fetch: cachingFetch, stats: cacheStats } = createCachingFetch(job.cacheDir);

let start;
const requests = [];
function fetchCounting(input, init) {
  const url = typeof input === 'string' ? input : (input.url ?? String(input));
  const method = init?.method ?? input?.method ?? 'GET';
  requests.push({ method, url, t: Math.round(performance.now() - start) });
  return cachingFetch(input, init);
}

const prunings = [];
class CollectingLogger extends Logger {
  trace() {}
  debug(message) {
    const match = /^Pruning (\d+) source-specific operations$/u.exec(message);
    if (match) {
      prunings.push(Number.parseInt(match[1], 10));
    }
  }

  info() {}
  warn() {}
  error() {}
  fatal() {}
}

async function main() {
  const engine = new QueryEngine();
  const result = {
    variantCheck: typeof ActorOptimizeQueryOperationPruneEmptySourceOperations.prototype.removeEmptyOperations === 'function' ?
      'after' :
      'before',
    results: 0,
    timeToFirstResultMs: null,
    totalTimeMs: null,
    timedOut: false,
    error: null,
  };
  start = performance.now();
  const partialInterval = setInterval(() => {
    fs.writeFileSync(outputFile, JSON.stringify({
      ...result,
      partial: true,
      totalTimeMs: performance.now() - start,
      requests: requests.length,
      cache: cacheStats,
      prunedOperations: prunings,
    }));
  }, 1000);
  partialInterval.unref();
  const timeout = setTimeout(() => {
    result.timedOut = true;
    finish(result);
  }, job.timeoutMs);
  try {
    const bindingsStream = await engine.queryBindings(job.query, {
      sources: job.sources,
      fetch: fetchCounting,
      log: new CollectingLogger(),
    });
    await new Promise((resolve, reject) => {
      bindingsStream.on('data', () => {
        if (result.results++ === 0) {
          result.timeToFirstResultMs = performance.now() - start;
        }
      });
      bindingsStream.on('error', reject);
      bindingsStream.on('end', resolve);
    });
    result.totalTimeMs = performance.now() - start;
  } catch (error) {
    result.totalTimeMs = performance.now() - start;
    result.error = String(error?.message ?? error).split('\n')[0].slice(0, 500);
  }
  clearTimeout(timeout);
  finish(result);
}

function finish(result) {
  if (result.timedOut) {
    result.totalTimeMs = performance.now() - start;
  }
  const requestsPerHost = {};
  for (const { url } of requests) {
    let host;
    try {
      host = new URL(url).host;
    } catch {
      host = url;
    }
    requestsPerHost[host] = (requestsPerHost[host] ?? 0) + 1;
  }
  fs.writeFileSync(outputFile, JSON.stringify({
    ...result,
    requests: requests.length,
    requestsPerHost,
    cache: job.cacheDir ? cacheStats : null,
    prunedOperations: prunings,
    requestUrls: requests,
  }));
  process.exit(0);
}

main();
