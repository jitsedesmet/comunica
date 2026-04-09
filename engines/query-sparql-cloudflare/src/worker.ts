/**
 * Cloudflare Worker entry point for Comunica SPARQL endpoint.
 *
 * This module provides a standards-compliant SPARQL HTTP endpoint
 * that runs on Cloudflare Workers edge infrastructure.
 */

import { QueryEngine } from '@comunica/query-sparql';

// Initialize the query engine (singleton for the worker)
let enginePromise: Promise<QueryEngine> | null = null;

function getEngine(): Promise<QueryEngine> {
  if (!enginePromise) {
    enginePromise = Promise.resolve(new QueryEngine());
  }
  return enginePromise;
}

export interface Env {
  // Add any environment bindings here (KV, D1, etc.)
  /**
   * JSON array of default data sources
   */
  DEFAULT_SOURCES?: string;
}

/**
 * CORS headers for cross-origin requests
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

/**
 * Handle CORS preflight requests
 */
function handleOptions(): Response {
  return new Response(null, {
    headers: corsHeaders,
  });
}

/**
 * Parse query and sources from the request
 */
async function parseRequest(request: Request, url: URL, env: Env): Promise<{
  query: string | null;
  sources: string[];
  accept: string;
}> {
  let query: string | null = null;
  let sources: string[] = [];

  // Parse default sources from environment
  if (env.DEFAULT_SOURCES) {
    try {
      sources = JSON.parse(env.DEFAULT_SOURCES);
    } catch {
      // Ignore parse errors
    }
  }

  // Parse Accept header
  const accept = request.headers.get('accept') ?? 'application/sparql-results+json';

  if (request.method === 'GET') {
    query = url.searchParams.get('query');
    const source = url.searchParams.get('source');
    if (source) {
      sources = source.split(',').map(s => s.trim());
    }
    // Also support 'sources' as comma-separated list
    const sourcesParam = url.searchParams.get('sources');
    if (sourcesParam) {
      sources = sourcesParam.split(',').map(s => s.trim());
    }
  } else if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      query = params.get('query');
      const source = params.get('source');
      if (source) {
        sources = source.split(',').map(s => s.trim());
      }
    } else if (contentType.includes('application/sparql-query')) {
      query = await request.text();
      // For direct SPARQL POST, sources must come from URL params or defaults
      const source = url.searchParams.get('source');
      if (source) {
        sources = source.split(',').map(s => s.trim());
      }
    } else if (contentType.includes('application/json')) {
      const body = <{ query?: string; sources?: string[] }> await request.json();
      query = body.query ?? null;
      if (body.sources) {
        sources = body.sources;
      }
    }
  }

  return { query, sources, accept };
}

/**
 * Execute a SPARQL query and return the response
 */
async function executeQuery(
  engine: QueryEngine,
  query: string,
  sources: string[],
  accept: string,
): Promise<Response> {
  // Execute the query
  const result = await engine.query(query, {
    sources: sources.map(source => ({ type: 'sparql', value: source })),
  });

  // Determine the best media type for serialization
  let mediaType = accept;

  // Map common Accept headers to supported media types
  if (accept.includes('*/*') || accept.includes('application/json')) {
    if (result.resultType === 'bindings' || result.resultType === 'boolean') {
      mediaType = 'application/sparql-results+json';
    } else if (result.resultType === 'quads') {
      mediaType = 'application/n-triples';
    }
  }

  try {
    // Serialize the result
    const { data } = await engine.resultToString(result, mediaType);

    // Convert AsyncIterator/Node stream to Web ReadableStream
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of <AsyncIterable<string>> data) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': mediaType,
        ...corsHeaders,
      },
    });
  } catch {
    // If serialization fails for the requested type, try a default
    const fallbackType = result.resultType === 'quads' ?
      'application/n-triples' :
      'application/sparql-results+json';

    const { data } = await engine.resultToString(result, fallbackType);

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of <AsyncIterable<string>> data) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': fallbackType,
        ...corsHeaders,
      },
    });
  }
}

/**
 * Return an HTML page with a simple SPARQL query interface
 */
function getHtmlInterface(url: URL): Response {
  const endpoint = `${url.origin}${url.pathname}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comunica SPARQL Endpoint</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #e31937; }
    textarea { width: 100%; height: 200px; font-family: monospace; }
    input[type="text"] { width: 100%; padding: 0.5rem; margin: 0.5rem 0; }
    button { background: #e31937; color: white; border: none; padding: 0.75rem 1.5rem; cursor: pointer; }
    button:hover { background: #b81430; }
    pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; }
    .form-group { margin: 1rem 0; }
    label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Comunica SPARQL Endpoint</h1>
  <p>This is a SPARQL endpoint powered by <a href="https://comunica.dev">Comunica</a> running on Cloudflare Workers.</p>

  <form id="queryForm">
    <div class="form-group">
      <label for="source">Data Source(s) (comma-separated URLs):</label>
      <input type="text" id="source" name="source" placeholder="https://dbpedia.org/sparql">
    </div>

    <div class="form-group">
      <label for="query">SPARQL Query:</label>
      <textarea id="query" name="query">SELECT * WHERE {
  ?s ?p ?o
} LIMIT 10</textarea>
    </div>

    <button type="submit">Execute Query</button>
  </form>

  <h2>Results</h2>
  <pre id="results">Results will appear here...</pre>

  <script>
    document.getElementById('queryForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = document.getElementById('query').value;
      const source = document.getElementById('source').value;
      const resultsEl = document.getElementById('results');

      resultsEl.textContent = 'Executing query...';

      try {
        const params = new URLSearchParams({ query });
        if (source) params.set('source', source);

        const response = await fetch('${endpoint}?' + params.toString(), {
          headers: { 'Accept': 'application/sparql-results+json' }
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = await response.json();
        resultsEl.textContent = JSON.stringify(data, null, 2);
      } catch (error) {
        resultsEl.textContent = 'Error: ' + error.message;
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders,
    },
  });
}

/**
 * Main fetch handler for the Cloudflare Worker
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Avoid unused variable warning
    void ctx;

    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    // Route handling
    if (url.pathname === '/' || url.pathname === '') {
      return Response.redirect(`${url.origin}/sparql`, 301);
    }

    if (url.pathname !== '/sparql') {
      return new Response(
        JSON.stringify({ error: 'Not found. Queries accepted on /sparql' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    try {
      const { query, sources, accept } = await parseRequest(request, url, env);

      // If no query provided and HTML is accepted, show the interface
      if (!query) {
        if (accept.includes('text/html')) {
          return getHtmlInterface(url);
        }
        return new Response(
          JSON.stringify({ error: 'Missing query parameter' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }

      if (sources.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No data sources specified. Use the "source" parameter.' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }

      const engine = await getEngine();
      return await executeQuery(engine, query, sources, accept);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return new Response(
        JSON.stringify({ error: `Query execution failed: ${message}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }
  },
};
