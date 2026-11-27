# Comunica Term Function RML IRI Function Factory Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-function-factory-term-rml-iri.svg)](https://www.npmjs.com/package/@comunica/actor-function-factory-term-rml-iri)

A [function factory](https://github.com/comunica/comunica/tree/master/packages/bus-function-factory) actor
that constructs the [term functions](https://github.com/comunica/comunica/tree/master/packages/bus-function-factory/lib/ActorFunctionFactory.ts)
with which [RML](https://w3id.org/rml/portal) mappings generate IRIs:

* `<internal://rml/to-iri>(?value, ?base)` resolves a value against a base IRI, and fails the query if the result is not a valid IRI.
* `<internal://rml/encode-for-iri>(?value)` percent-encodes the characters that are not allowed everywhere in an IRI, which keeps non-ASCII characters unlike `ENCODE_FOR_URI`.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-function-factory-term-rml-iri
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-function-factory-term-rml-iri/^5.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:function-factory/actors#term-function-rml-iri",
      "@type": "ActorFunctionFactoryTermRmlIri"
    }
  ]
}
```
