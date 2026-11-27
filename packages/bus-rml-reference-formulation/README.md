# Comunica Bus RML Reference Formulation

[![npm version](https://badge.fury.io/js/%40comunica%2Fbus-rml-reference-formulation.svg)](https://www.npmjs.com/package/@comunica/bus-rml-reference-formulation)

A comunica bus for evaluating the iterator and references of an RML logical source on its data,
with one actor per reference formulation, such as CSV or JSONPath.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/bus-rml-reference-formulation
```

## Usage

## Bus usage

* **Context**: `"https://linkedsoftwaredependencies.org/bundles/npm/@comunica/bus-rml-reference-formulation/^5.0.0/components/context.jsonld"`
* **Bus name**: `ActorRmlReferenceFormulation:_default_bus`

## Creating actors on this bus

Actors extending [`ActorRmlReferenceFormulation`](https://comunica.github.io/comunica/classes/_comunica_bus_rml_reference_formulation.ActorRmlReferenceFormulation.html) are automatically subscribed to this bus.
