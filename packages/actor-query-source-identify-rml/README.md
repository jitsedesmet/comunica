# Comunica RML Query Source Identify Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-query-source-identify-rml.svg)](https://www.npmjs.com/package/@comunica/actor-query-source-identify-rml)

A [Query Source Identify](https://github.com/comunica/comunica/tree/master/packages/bus-query-source-identify) actor that handles [RML](https://rml.io/) mappings,
by executing the mapping, and exposing the generated RDF as a query source.

This actor enables the possibility to query over non-RDF sources such as JSON, CSV, and XML documents,
by passing the URL or path of an RML mapping document in Turtle as source:
```js
{ sources: [{ type: 'rml', value: 'http://example.org/mapping.ttl' }]; }
```

The logical sources of the mapping (`rml:source`) are fetched over the [Dereference bus](https://github.com/comunica/comunica/tree/master/packages/bus-dereference),
where relative references are resolved against the URL of the mapping document.

Limitations:
* The mapping is fully materialized in memory when the source is identified, so no parts of the query are pushed down into the mapping.
* Mappings are executed using [`@comake/rmlmapper-js`](https://github.com/comake/rmlmapper-js),
  which only supports the legacy RML vocabulary (`http://semweb.mmlab.be/ns/rml#`) with JSON, CSV, and XML sources.
* The generated RDF is cached under the URL of the mapping document, so invalidating the URL of a logical source does not refresh it.
* Only logical sources that are referred to by name are fetched, so sources such as databases are not supported.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-query-source-identify-rml
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-query-source-identify-rml/^5.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:query-source-identify/actors#rml",
      "@type": "ActorQuerySourceIdentifyRml",
      "mediatorDereference": { "@id": "urn:comunica:default:dereference/mediators#main" },
      "mediatorRdfParse": { "@id": "urn:comunica:default:rdf-parse/mediators#parse" },
      "mediatorQuerySourceIdentify": { "@id": "urn:comunica:default:query-source-identify/mediators#main" }
    }
  ]
}
```

### Config Parameters

* `mediatorDereference`: A mediator over the [Dereference bus](https://github.com/comunica/comunica/tree/master/packages/bus-dereference).
* `mediatorRdfParse`: A mediator over the [RDF Parse bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-parse).
* `mediatorQuerySourceIdentify`: A mediator over the [Query Source Identify bus](https://github.com/comunica/comunica/tree/master/packages/bus-query-source-identify).
