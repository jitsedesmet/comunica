# Comunica CSV RML Reference Formulation Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-rml-reference-formulation-csv.svg)](https://www.npmjs.com/package/@comunica/actor-rml-reference-formulation-csv)

An [RML Reference Formulation](https://github.com/comunica/comunica/tree/master/packages/bus-rml-reference-formulation) actor
that reads CSV data, where each row is a record and a reference is a column name.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-rml-reference-formulation-csv
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-rml-reference-formulation-csv/^5.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:rml-reference-formulation/actors#csv",
      "@type": "ActorRmlReferenceFormulationCsv"
    }
  ]
}
```
