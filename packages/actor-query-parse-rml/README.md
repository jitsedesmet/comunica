# Comunica RML Query Parse Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-query-parse-rml.svg)](https://www.npmjs.com/package/@comunica/actor-query-parse-rml)

A [Query Parse](https://github.com/comunica/comunica/tree/master/packages/bus-query-parse) actor
that parses an [RML](https://w3id.org/rml/portal) mapping in Turtle
into an operation that constructs the quads the mapping generates,
following the [RML algebra](https://arxiv.org/abs/2503.10385).

It handles queries with query format `{ language: 'rml', version: '1.0' }`, as
[`@comunica/materialize-rml`](https://github.com/comunica/comunica/tree/master/engines/materialize-rml) passes them.
Relative source paths are resolved against the `@comunica/actor-query-parse-rml:mappingDirectory` context entry.

[RML-Core](https://w3id.org/rml/core/spec) is supported, except for blank nodes without template or reference.
A mapping that uses any other property of the RML vocabulary is rejected.
The generated plan uses the functions of
[`@comunica/actor-function-factory-term-rml-iri`](https://github.com/comunica/comunica/tree/master/packages/actor-function-factory-term-rml-iri) and
[`@comunica/actor-function-factory-term-internal-blank-node`](https://github.com/comunica/comunica/tree/master/packages/actor-function-factory-term-internal-blank-node).

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-query-parse-rml
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-query-parse-rml/^5.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:query-parse/actors#rml",
      "@type": "ActorQueryParseRml",
      "mediatorRdfParse": { "@id": "urn:comunica:default:rdf-parse/mediators#parse" }
    }
  ]
}
```

### Config Parameters

* `mediatorRdfParse`: A mediator over the [RDF Parse bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-parse).
