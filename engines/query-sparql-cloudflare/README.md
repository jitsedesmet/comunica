# @comunica/query-sparql-cloudflare

A [Cloudflare Workers](https://workers.cloudflare.com/) wrapper for the [Comunica](https://comunica.dev/) SPARQL query engine.

This package provides a ready-to-deploy SPARQL endpoint that runs on Cloudflare's edge network, enabling low-latency federated SPARQL queries from anywhere in the world.

## Features

- **Edge Computing**: Run SPARQL queries on Cloudflare's global edge network
- **Federated Queries**: Query multiple SPARQL endpoints and RDF sources
- **Standards Compliant**: Full SPARQL 1.1 Query support via Comunica
- **CORS Support**: Built-in CORS handling for browser-based applications
- **HTML Interface**: Built-in query interface when accessed via browser

## Quick Start

### 1. Clone or copy this package

```bash
# From the Comunica monorepo
cd engines/query-sparql-cloudflare
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the worker

```bash
npm run build:worker
```

### 4. Test locally

```bash
npm run dev
```

### 5. Deploy to Cloudflare

```bash
npm run deploy
```

## Usage

Once deployed, query the endpoint:

```bash
# Simple query
curl "https://your-worker.workers.dev/sparql?query=SELECT%20*%20WHERE%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D%20LIMIT%2010&source=https://dbpedia.org/sparql"

# POST request
curl -X POST "https://your-worker.workers.dev/sparql" \
  -H "Content-Type: application/sparql-query" \
  -H "Accept: application/sparql-results+json" \
  --data-urlencode "source=https://dbpedia.org/sparql" \
  -d "SELECT * WHERE { ?s ?p ?o } LIMIT 10"
```

Or open in a browser to get an interactive query interface.

## Configuration

Edit `wrangler.toml` to configure:

```toml
[vars]
# Pre-configure default data sources
DEFAULT_SOURCES = '["https://dbpedia.org/sparql"]'
```

## API

### Query Parameters

| Parameter | Description |
|-----------|-------------|
| `query` | The SPARQL query string |
| `source` | Data source URL(s), comma-separated |
| `sources` | Alternative to `source` |

### Response Formats

Content negotiation via `Accept` header:
- `application/sparql-results+json` (default for SELECT/ASK)
- `application/sparql-results+xml`
- `application/n-triples` (for CONSTRUCT/DESCRIBE)
- `text/turtle`

## Architecture

This package is a thin wrapper around `@comunica/query-sparql`:

```
@comunica/query-sparql-cloudflare
├── Depends on @comunica/query-sparql (the full SPARQL engine)
└── Adds Cloudflare Worker handler (src/worker.ts)
```

The standard `@comunica/query-sparql` engine already uses `@comunica/actor-http-fetch` which is based on the Fetch API - making it fully compatible with Cloudflare Workers.

## Limitations

- **Bundle Size**: ~2-3MB bundled; requires Cloudflare Workers paid plan for larger bundles
- **Execution Time**: Complex queries may exceed CPU time limits (50ms free, 30s paid)
- **Memory**: 128MB limit per worker invocation

## Customization

This package serves as both a deployable worker AND an example. To customize:

1. Fork/copy the `src/worker.ts` file
2. Modify the request handling, add authentication, caching, etc.
3. Build and deploy your custom version

## License

MIT
