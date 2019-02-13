# Comunica Copy Query Operation Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-query-operation-update-copy-rewrite.svg)](https://www.npmjs.com/package/@comunica/actor-query-operation-update-copy-rewrite)

A [Query Operation](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation) actor that
handles [SPARQL copy](https://www.w3.org/TR/sparql11-update/#copy) operations by rewriting the operation in terms of drop and add.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-query-operation-update-copy-rewrite
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-query-operation-update-copy-rewrite/^2.0.0/components/context.jsonld"  
  ],
  "actors": [
    ...
    {
      "@id": "n#myCopyQueryOperator",
      "@type": "ActorQueryOperationCopy",
      "mediatorQueryOperation": { "@id": "urn:comunica:default:query-operation/mediators#main" }
    }
  ]
}
```

### Config Parameters

* `mediatorQueryOperation`: A mediator over the [Query Operation bus](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation).