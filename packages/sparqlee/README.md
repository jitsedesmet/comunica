# Sparqlee

[![Greenkeeper badge](https://badges.greenkeeper.io/comunica/sparqlee.svg)](https://greenkeeper.io/)
[![Build Status](https://travis-ci.org/comunica/sparqlee.svg?branch=master)](https://travis-ci.org/comunica/sparqlee)
[![Coverage Status](https://coveralls.io/repos/github/comunica/sparqlee/badge.svg?branch=master)](https://coveralls.io/github/comunica/sparqlee?branch=master)
[![Gitter chat](https://badges.gitter.im/comunica.png)](https://gitter.im/comunica/Lobby)

A simple SPARQL expression evaluator library.

This package is available on [npm](https://www.npmjs.com/package/sparqlee), type definitions are provided.

## Using Sparqlee

```ts
const expression = ...some sparql algebra expression...;
const bindings = ...some bindings/solution mapping...;

// Create an evaluator (a sync evaluator will exist in the future too)
const evaluator = new AsyncEvaluator(expression)

// evaluate it as a term
const result: RDF.Term = await evaluator.evaluate(bindings);

// or evaluate it as an Effective Boolean Value (for e.g in FILTER)
const result: boolean = await evaluator.evaluateAsEBV(bindings);

```

Note: If you want to use *aggregates*, or *exists* you should check out the [stream section](#streams).

### Errors

Sparqlee exports an Error class called `ExpressionError` from which all SPARQL related errors inherit. These might include unbound variables, wrong types, invalid lexical forms, and much more. More info on errors [here](lib/util/Errors.ts). These errors can be caught, and may impact program execution in an expected way. All other errors are unexpected, and are thus programmer mistakes or mistakes in this library.

```ts
// Make sure to catch errors if you don't control binding input
try {
  const result = await evaluator.evaluate(bindings);
  consumeResult(result;)
} catch (error) {
    if (error instanceof ExpressionError) {
        console.log(error); // SPARQL related errors
    } else {
        throw error; // programming errors or missing features.
    }
}
```

### Streams

'Aggregates' and 'Exists' operations are annoying problems to tackle in the context of an expression evaluator, since they make the whole thing statefull.
They might span entire streams and, depending on the use case, have very different requirements for speed and memory consumption. Sparqlee has therefore decided to delegate this responsibility back to you (and might provide utility in the future). It accepts functions that will resolve the respective aggregate and exists operators, and will use those when needed. This way, the library can still be optimized for simple use cases, both in it's API as in it's development time, while it can still support the full spec.

**NOTE: Aggregates and Exists are not implemented yet.**

## Spec compliance

**TODO** Add section about differences from the spec and which functions are affected (and which are implemented). See also [extensible value testing and error handling](https://www.w3.org/TR/sparql11-query/#extensionFunctions).

**TODO** String literals (plain literals etc...)

**TODO** Replace with check marks

|    Function    | Implemented | Tested | Spec compliant |
|----------------|-------------|--------|----------------|
| [Operator Mapping](https://www.w3.org/TR/sparql11-query/#OperatorMapping)
| ! (not)        | X | X | X |
| + (unary plus) | X | X |   |
| - (unary minus)| X | X |   |
| \|\|           | X | X |   |
| &&             | X | X |   |
| =              | X | X |   |
| !=             | X | X |   |
| <              | X | X |   |
| >              | X | X |   |
| <=             | X | X |   |
| >=             | X | X |   |
| *              | X | X |   |
| /              | X | X |   |
| +              | X | X |   |
| -              | X | X |   |
| _Note_         |   |   | Spec compliance depends on #13 and #14 |
| [Functional Forms](https://www.w3.org/TR/sparql11-query/#func-forms)
| BOUND          | X |   |   |
| IF             | X |   |   |
| COALESCE       | X |   |   |
| NOT EXISTS     |   |   |   |
| EXISTS         |   |   |   |
| logical-or     | X | X | X |
| logical-and    | X | X | X |
| RDFTerm-equal  | X | X | ? |
| sameTerm       | X |   |   |
| IN             | X |   |   |
| NOT IN         | X |   |   |
|
| [On RDF Terms](https://www.w3.org/TR/sparql11-query/#func-rdfTerms)
| isIRI          |   |   |   |
| isBlank        |   |   |   |
| isLiteral      |   |   |   |
| isNumeric      |   |   |   |
| str            | X | X | X |
| lang           | X | X | X |
| datatype       | X | X | X |
| IRI            |   |   |   |
| BNODE          |   |   |   |
| STRDT          |   |   |   |
| STRLANG        |   |   |   |
| UUID           |   |   |   |
| STRUID         |   |   |   |
|
| [On Strings](https://www.w3.org/TR/sparql11-query/#func-strings)
| STRLEN         | X | X | X |
| SUBSTR         |   |   |   |
| UCASE          |   |   |   |
| LCASE          |   |   |   |
| STRSTARTS      |   |   |   |
| STRENDS        |   |   |   |
| CONTAINS       |   |   |   |
| STRBEFORE      |   |   |   |
| STRAFTER       |   |   |   |
| ENCODE_FOR_URI |   |   |   |
| CONCAT         |   |   |   |
| langMatches    | X | X | ? |
| REGEX          | X | X |   |
| REPLACE        |   |   |   |
|
| [On Numerics](https://www.w3.org/TR/sparql11-query/#func-numerics)
| abs            | X |   |   |
| round          |   |   |   |
| ceil           |   |   |   |
| floor          |   |   |   |
| RAND           |   |   |   |
|
| [On Dates and Times](https://www.w3.org/TR/sparql11-query/#func-date-time)
| now            |   |   |   |
| year           |   |   |   |
| month          |   |   |   |
| day            |   |   |   |
| hours          |   |   |   |
| minutes        |   |   |   |
| seconds        |   |   |   |
| timezone       |   |   |   |
| tz             |   |   |   |
|
| [Hash Functions](https://www.w3.org/TR/sparql11-query/#func-hash)
| SHA1           |   |   |   |
| SHA256         |   |   |   |
| SHA384         |   |   |   |
| SHA512         |   |   |   |
|
| [XPath Constructor Functions](https://www.w3.org/TR/sparql11-query/#FunctionMapping)
| str (see 'On Terms') | X | X | X |
| flt            |   |   |   |
| dbl            |   |   |   |
| dec            |   |   |   |
| int            |   |   |   |
| dT             |   |   |   |
| bool           |   |   |   |
| IRI            |   |   |   |
| ltrl           |   |   |   |

## Development

## Setup locally

1. Install `yarn` (or `npm`) and `node`.
2. Run `yarn install`.
3. Use these evident commands (or check `package.json`):
    * building once: `yarn run build`
    * build and watch: `yarn run watch`
    * testing: `yarn run test`
    * benchmarking: `yarn run bench`

### Adding unimplemented functions

Functions are defined in the [functions directory](lib/functions/), and you can add them there. All definitions are defined using a builder model defined in [Helpers.ts](lib/functions/Helpers.ts).

Three kinds exists:

* Regular functions: Functions with a uniform interface, that only need their arguments to calculate their result.
* Special functions: whose behaviour deviates enough from the norm to warrant the implementations taking full control over type checking and evaluation (these are mostly the functional forms).
* Named functions: which correspond to the SPARQLAlgebra Named Expressions.

**TODO**: Explain this hot mess some more.

### Layout and control flow

The only important external facing API is creating an Evaluator.
When you create one, the SPARQL Algebra expression that is passed will be transformed to an internal representation (see [Transformation.ts](./lib/Transformation.ts)). This will build objects (see [expressions module](./lib/expressions)) that contain all the logic and data for evaluation, for example the implementations for SPARQL functions (see [functions module](./lib/functions)). After transformation, the evaluator will recursively evaluate all the expressions.

### Testing

Running tests will generate a `test-report.html` in the root dir.
**TODO** Explain test organizatian and expression tables