# Comunica Graph Pushdown Optimize Query Operation Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-optimize-query-operation-graph-pushdown.svg)](https://www.npmjs.com/package/@comunica/actor-optimize-query-operation-graph-pushdown)

An [Optimize Query Operation](https://github.com/comunica/comunica/tree/master/packages/bus-optimize-query-operation) actor
that pushes GRAPH operations into the quad patterns and property paths of their input.

A GRAPH operation is only pushed down if this gives the same solutions
as evaluating its input over every matching named graph separately.
For example, `GRAPH ?g { ?s ?p ?o }` becomes the quad pattern `?s ?p ?o ?g`,
while `GRAPH ?g { ?s ?p ?o FILTER(!BOUND(?g)) }` is left as-is.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-optimize-query-operation-graph-pushdown
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-optimize-query-operation-graph-pushdown/^5.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:optimize-query-operation/actors#graph-pushdown",
      "@type": "ActorOptimizeQueryOperationGraphPushdown"
    }
  ]
}
```
