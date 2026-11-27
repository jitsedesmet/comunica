# Comunica RML Init Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-init-rml.svg)](https://www.npmjs.com/package/@comunica/actor-init-rml)

An [Init](https://github.com/comunica/comunica/tree/master/packages/bus-init) actor
that exposes the mediators for materializing [RML](https://w3id.org/rml/portal) mappings.
Its `RmlEngineBase` is the base of [`@comunica/materialize-rml`](https://github.com/comunica/comunica/tree/master/engines/materialize-rml).

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-init-rml
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-init-rml/^5.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:init/actors#rml",
      "@type": "ActorInitRml",
      "mediatorQueryParse": { "@id": "urn:comunica:default:query-parse/mediators#main" },
      "mediatorQueryOperation": { "@id": "urn:comunica:default:query-operation/mediators#main" }
    }
  ]
}
```

### Config Parameters

* `mediatorQueryParse`: A mediator over the [Query Parse bus](https://github.com/comunica/comunica/tree/master/packages/bus-query-parse).
* `mediatorQueryOperation`: A mediator over the [Query Operation bus](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation).
