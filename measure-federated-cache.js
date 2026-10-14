/* eslint-disable ts/no-var-requires, ts/no-require-imports, no-sync, import/no-nodejs-modules -- standalone Node.js measurement scripts */
/**
 * A fetch wrapper with a persistent on-disk HTTP cache, used by the measurement scripts,
 * so that the measurements do not depend on the availability and response times of the remote endpoints.
 *
 * Responses are cached by method, URL, Accept and Content-Type headers, and body.
 * On a cache miss, the request is sent to the live server, and the response is stored if it was successful (2xx),
 * so that transient failures (e.g., HTTP 503 or 429) are not cached.
 * Every request is counted by the caller, regardless of whether it was served from the cache.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CACHE_DIR = path.join(__dirname, '.measure-federated-cache');

function serializeBody(body) {
  if (body === undefined || body === null) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer ?? body, body.byteOffset ?? 0, body.byteLength).toString('base64');
  }
  // Streams and other bodies cannot be keyed without consuming them
}

/**
 * @param {string | undefined} cacheDir Directory of the cache, or undefined to disable caching.
 * @returns {{ fetch: typeof fetch, stats: { hits: number, misses: number, uncacheable: number } }} The caching fetch function, and its cache statistics.
 */
function createCachingFetch(cacheDir) {
  const stats = { hits: 0, misses: 0, uncacheable: 0 };
  if (!cacheDir) {
    return { fetch: (input, init) => fetch(input, init), stats };
  }
  fs.mkdirSync(cacheDir, { recursive: true });

  const cachingFetch = async(input, init) => {
    const url = typeof input === 'string' ? input : (input.url ?? String(input));
    const method = (init?.method ?? input?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? input?.headers);
    const body = serializeBody(init?.body);
    if (body === undefined) {
      stats.uncacheable++;
      return fetch(input, init);
    }
    const key = crypto.createHash('sha256')
      .update(JSON.stringify([ method, url, headers.get('accept'), headers.get('content-type'), body ]))
      .digest('hex');
    const metaFile = path.join(cacheDir, `${key}.json`);
    const bodyFile = path.join(cacheDir, `${key}.body`);

    let entry;
    try {
      entry = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      entry.body = fs.readFileSync(bodyFile);
      stats.hits++;
    } catch {
      entry = undefined;
    }
    if (!entry) {
      stats.misses++;
      const response = await fetch(input, init);
      if (!response.ok) {
        return response;
      }
      entry = {
        request: { method, url },
        url: response.url || url,
        redirected: response.redirected,
        status: response.status,
        statusText: response.statusText,
        headers: [ ...response.headers ]
          // The body is stored decoded, so encoding-related headers are no longer valid
          .filter(([ name ]) => ![ 'content-encoding', 'content-length', 'transfer-encoding' ].includes(name)),
        body: Buffer.from(await response.arrayBuffer()),
      };
      // Write atomically, as other processes may read the cache concurrently
      const suffix = `.${process.pid}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(bodyFile + suffix, entry.body);
      fs.renameSync(bodyFile + suffix, bodyFile);
      const { body: _, ...meta } = entry;
      fs.writeFileSync(metaFile + suffix, JSON.stringify(meta));
      fs.renameSync(metaFile + suffix, metaFile);
    }

    const response = new Response(method === 'HEAD' ? null : entry.body, {
      status: entry.status,
      statusText: entry.statusText,
      headers: entry.headers,
    });
    // Comunica uses the final URL (after redirects) as base IRI
    Object.defineProperty(response, 'url', { value: entry.url });
    Object.defineProperty(response, 'redirected', { value: entry.redirected });
    return response;
  };
  return { fetch: cachingFetch, stats };
}

module.exports = { createCachingFetch, DEFAULT_CACHE_DIR };
