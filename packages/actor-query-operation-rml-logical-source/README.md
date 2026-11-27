# Comunica RML Logical Source Query Operation Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-query-operation-rml-logical-source.svg)](https://www.npmjs.com/package/@comunica/actor-query-operation-rml-logical-source)

A [Query Operation](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation) actor
that evaluates the source operator of the [RML algebra](https://arxiv.org/abs/2503.10385):
it binds the referenced values of each record in a non-RDF data source to variables.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-query-operation-rml-logical-source
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-query-operation-rml-logical-source/^5.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:query-operation/actors#rml-logical-source",
      "@type": "ActorQueryOperationRmlLogicalSource",
      "mediatorQueryOperation": { "@id": "urn:comunica:default:query-operation/mediators#main" },
      "mediatorDereference": { "@id": "urn:comunica:default:dereference/mediators#main" },
      "mediatorRmlReferenceFormulation": { "@id": "urn:comunica:default:rml-reference-formulation/mediators#main" },
      "mediatorMergeBindingsContext": { "@id": "urn:comunica:default:merge-bindings-context/mediators#main" }
    }
  ]
}
```

### Config Parameters

* `mediatorQueryOperation`: A mediator over the [Query Operation bus](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation).
* `mediatorDereference`: A mediator over the [Dereference bus](https://github.com/comunica/comunica/tree/master/packages/bus-dereference).
* `mediatorRmlReferenceFormulation`: A mediator over the [RML Reference Formulation bus](https://github.com/comunica/comunica/tree/master/packages/bus-rml-reference-formulation).
* `mediatorMergeBindingsContext`: A mediator over the [Merge Bindings Context bus](https://github.com/comunica/comunica/tree/master/packages/bus-merge-bindings-context).
