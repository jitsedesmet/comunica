# Comunica Materialize RML

[![npm version](https://badge.fury.io/js/%40comunica%2Fmaterialize-rml.svg)](https://www.npmjs.com/package/@comunica/materialize-rml)

A standalone engine that materializes [RML](https://w3id.org/rml/portal) mappings:
it generates the RDF quads that a mapping defines over non-RDF data, such as CSV and JSON files.
The mapping is translated into a plan following the [RML algebra](https://arxiv.org/abs/2503.10385),
which is evaluated by the same actors that evaluate SPARQL queries.

This module is part of the [Comunica framework](https://github.com/comunica/comunica).

## Install

```bash
$ yarn add @comunica/materialize-rml
```

## Usage

```typescript
import { RmlEngine } from '@comunica/materialize-rml';

const quads = await new RmlEngine().materialize(mappingInTurtle, {
  // Generated relative IRIs are resolved against the base IRI
  baseIRI: 'http://example.org/',
  // Relative source paths are resolved against the mapping directory
  mappingDirectory: 'file:///path/to/mappings/',
});
quads.on('data', quad => console.log(quad));
```

`materialize` returns a stream of [RDF/JS](https://rdf.js.org/) quads without duplicates.
Sources are local files or HTTP URLs, in CSV (the default) or JSON with JSONPath.

## Conformance

[RML-Core](https://w3id.org/rml/core/spec) is supported, except for blank nodes without template or reference.
A mapping that uses any other property of the RML vocabulary is rejected.
The [RML-Core test cases](https://github.com/kg-construct/rml-core/tree/main/test-cases) are run by `yarn run spec`.
