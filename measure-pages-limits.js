/**
 * Temporary measurement of the request limits of GitHub Pages, to pick defaults for
 * maxConcurrentRequests / retries / retryDelay in rdf-test-suite.js.
 *
 * 1. Collects all files of the given test manifests (following mf:include), like rdf-test-suite does.
 * 2. For each concurrency level, fetches every unique file once (cold, no retries), and reports
 *    status codes, network errors, throughput and latency.
 * 3. Stops at the first level that receives a 429, and then probes a single file every PROBE_INTERVAL_MS
 *    to measure how long the block lasts.
 *
 * Usage: node measure-pages-limits.js manifest-url...
 * Env: LEVELS (comma-separated, 0 = unlimited), PAUSE_MS, PROBE_INTERVAL_MS, PROBE_MAX_MS
 */
const { Parser } = require('n3');

const LEVELS = (process.env.LEVELS ?? '16,32,64,128,0').split(',').map(Number);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 120_000);
const PROBE_INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? 15_000);
const PROBE_MAX_MS = Number(process.env.PROBE_MAX_MS ?? 900_000);
const TIMEOUT_MS = 30_000;
const HEADERS = { 'user-agent': 'rdf-test-suite-pages-limit-measurement (jitsedesmet)' };

const MF = 'http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#';
const QT = 'http://www.w3.org/2001/sw/DataAccess/tests/test-query#';
const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
const FILE_PREDICATES = new Set([ `${MF}result`, `${QT}query`, `${QT}data`, `${QT}graphData` ]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);

async function collectUrls(manifests) {
  const files = new Set(manifests);
  const queue = [ ...manifests ];
  while (queue.length > 0) {
    const url = queue.shift();
    const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`Discovery failed with ${response.status} on ${url}`);
    }
    const quads = new Parser({ baseIRI: url }).parse(await response.text());
    for (const quad of quads) {
      if (quad.object.termType !== 'NamedNode') {
        continue;
      }
      const isInclude = quad.predicate.value === RDF_FIRST && quad.object.value.endsWith('.ttl') &&
        !quad.object.value.includes('#');
      if (isInclude && !files.has(quad.object.value)) {
        files.add(quad.object.value);
        queue.push(quad.object.value);
      } else if (FILE_PREDICATES.has(quad.predicate.value)) {
        files.add(quad.object.value);
      }
    }
  }
  return [ ...files ];
}

function percentile(sorted, p) {
  return sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function runLevel(urls, level) {
  const statuses = {};
  const errors = {};
  const latencies = [];
  let first429;
  let next = 0;
  const start = Date.now();

  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      const t0 = Date.now();
      try {
        const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
        const body = await response.text();
        latencies.push(Date.now() - t0);
        statuses[response.status] = (statuses[response.status] ?? 0) + 1;
        if (response.status === 429 && !first429) {
          first429 = {
            afterMs: Date.now() - start,
            afterRequests: Object.values(statuses).reduce((a, b) => a + b, 0),
            url,
            headers: Object.fromEntries(response.headers),
            body: body.replaceAll(/\s+/gu, ' ').slice(0, 400),
          };
        }
      } catch (error) {
        const code = error.cause?.code ?? error.name ?? String(error);
        errors[code] = (errors[code] ?? 0) + 1;
      }
    }
  }

  const workers = level === 0 ? urls.length : level;
  await Promise.all(Array.from({ length: workers }, worker));
  const durationMs = Date.now() - start;
  latencies.sort((a, b) => a - b);
  return {
    level: level === 0 ? 'unlimited' : level,
    requests: urls.length,
    durationMs,
    requestsPerSecond: Math.round(urls.length / (durationMs / 1000)),
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: latencies.at(-1) },
    statuses,
    errors,
    first429,
  };
}

async function probeBlock(url) {
  const start = Date.now();
  while (Date.now() - start < PROBE_MAX_MS) {
    await sleep(PROBE_INTERVAL_MS);
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      await response.text();
      log(`probe: ${response.status} (retry-after: ${response.headers.get('retry-after')})`);
      if (response.status !== 429) {
        return { unblockedAfterMs: Date.now() - start };
      }
    } catch (error) {
      log(`probe: ${error.cause?.code ?? error.name}`);
    }
  }
  return { stillBlockedAfterMs: Date.now() - start };
}

async function main() {
  const manifests = process.argv.slice(2);
  const urls = await collectUrls(manifests);
  const sample = await fetch(urls[0], { headers: HEADERS });
  await sample.text();
  log(`Collected ${urls.length} unique files from ${manifests.length} manifests`);
  log('Sample response headers:', JSON.stringify(Object.fromEntries(sample.headers)));

  const results = [];
  for (const [ i, level ] of LEVELS.entries()) {
    if (i > 0) {
      log(`Pausing ${PAUSE_MS} ms before the next level`);
      await sleep(PAUSE_MS);
    }
    log(`Level ${level === 0 ? 'unlimited' : level}: fetching ${urls.length} files`);
    const result = await runLevel(urls, level);
    results.push(result);
    log(JSON.stringify(result, null, 2));
    if (result.first429) {
      log('Received a 429, probing how long the block lasts');
      result.block = await probeBlock(result.first429.url);
      log(JSON.stringify(result.block));
      break;
    }
  }

  log('SUMMARY');
  console.log('| concurrency | requests | duration (s) | req/s | p50 (ms) | p95 (ms) | statuses | errors | first 429 after |');
  console.log('|-|-|-|-|-|-|-|-|-|');
  for (const r of results) {
    console.log(`| ${r.level} | ${r.requests} | ${(r.durationMs / 1000).toFixed(1)} | ${r.requestsPerSecond} | ` +
      `${r.latencyMs.p50} | ${r.latencyMs.p95} | ${JSON.stringify(r.statuses)} | ${JSON.stringify(r.errors)} | ` +
      `${r.first429 ? `${r.first429.afterRequests} req / ${r.first429.afterMs} ms` : '-'} |`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
