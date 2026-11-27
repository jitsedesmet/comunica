# Comunica Graph Query Operation Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-query-operation-graph.svg)](https://www.npmjs.com/package/@comunica/actor-query-operation-graph)

A [Query Operation](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation) actor that handles [SPARQL `GRAPH`](https://www.w3.org/TR/sparql12-query/#defn_evalGraph) operations.

It evaluates the input of a GRAPH operation over every named graph that matches the graph name separately.
Named graphs are discovered in a streaming manner, where a named graph exists if it contains at least one quad.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-query-operation-graph
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-query-operation-graph/^5.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:query-operation/actors#graph",
      "@type": "ActorQueryOperationGraph",
      "mediatorQueryOperation": { "@id": "urn:comunica:default:query-operation/mediators#main" }
    }
  ]
}
```

### Config Parameters

* `mediatorQueryOperation`: A mediator over the [Query Operation bus](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation).
