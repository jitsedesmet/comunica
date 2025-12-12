# Add-wins Set CRDT

[![npm version](https://badge.fury.io/js/%40comunica%2Futils-algebra.svg)](https://www.npmjs.com/package/@comunica/utils-algebra)

Exposes the algebra used by Comunica.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/utils-crdt-store
```

## Exposed

* `CrdtStore`: A Store implementation of the CRDT.
* `CRDT`: enum of namedNodes used by this library

## Additional

You should watch out with the blank nodes you create.

