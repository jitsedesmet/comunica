const { AlgebraFactory } = require('@comunica/utils-algebra');
const { DataFactory } = require('rdf-data-factory');

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);

const XSD = 'http://www.w3.org/2001/XMLSchema#';

/**
 * Thrown for XPath expressions that have no SPARQL equivalent, so the test can be skipped instead of failed.
 */
class UnsupportedError extends Error {}

/**
 * The XSD types for which the expression engine has a cast function.
 */
const CAST_TYPES = new Set([
  'string',
  'boolean',
  'integer',
  'decimal',
  'float',
  'double',
  'dateTime',
  'date',
  'time',
  'duration',
  'dayTimeDuration',
  'yearMonthDuration',
]);

/**
 * The XSD types derived from xsd:integer, which the expression engine knows but has no cast function for.
 * Constructing them from a string literal results in a typed literal.
 */
const INTEGER_TYPES = new Set([
  'nonPositiveInteger',
  'negativeInteger',
  'long',
  'int',
  'short',
  'byte',
  'nonNegativeInteger',
  'unsignedLong',
  'unsignedInt',
  'unsignedShort',
  'unsignedByte',
  'positiveInteger',
]);

/**
 * XPath functions, by name and arity, mapped onto the SPARQL operators that the SPARQL specification defines with them.
 */
const FUNCTIONS = {
  abs: { arities: [ 1 ], operator: 'abs' },
  ceiling: { arities: [ 1 ], operator: 'ceil' },
  floor: { arities: [ 1 ], operator: 'floor' },
  round: { arities: [ 1 ], operator: 'round' },
  'string-length': { arities: [ 1 ], operator: 'strlen' },
  substring: { arities: [ 2, 3 ], operator: 'substr' },
  'upper-case': { arities: [ 1 ], operator: 'ucase' },
  'lower-case': { arities: [ 1 ], operator: 'lcase' },
  'starts-with': { arities: [ 2 ], operator: 'strstarts' },
  'ends-with': { arities: [ 2 ], operator: 'strends' },
  contains: { arities: [ 2 ], operator: 'contains' },
  'substring-before': { arities: [ 2 ], operator: 'strbefore' },
  'substring-after': { arities: [ 2 ], operator: 'strafter' },
  'encode-for-uri': { arities: [ 1 ], operator: 'encode_for_uri' },
  matches: { arities: [ 2, 3 ], operator: 'regex' },
  replace: { arities: [ 3, 4 ], operator: 'replace' },
  'year-from-dateTime': { arities: [ 1 ], operator: 'year' },
  'year-from-date': { arities: [ 1 ], operator: 'year' },
  'month-from-dateTime': { arities: [ 1 ], operator: 'month' },
  'month-from-date': { arities: [ 1 ], operator: 'month' },
  'day-from-dateTime': { arities: [ 1 ], operator: 'day' },
  'day-from-date': { arities: [ 1 ], operator: 'day' },
  'hours-from-dateTime': { arities: [ 1 ], operator: 'hours' },
  'hours-from-time': { arities: [ 1 ], operator: 'hours' },
  'minutes-from-dateTime': { arities: [ 1 ], operator: 'minutes' },
  'minutes-from-time': { arities: [ 1 ], operator: 'minutes' },
  'seconds-from-dateTime': { arities: [ 1 ], operator: 'seconds' },
  'seconds-from-time': { arities: [ 1 ], operator: 'seconds' },
  'timezone-from-dateTime': { arities: [ 1 ], operator: 'timezone' },
  not: { arities: [ 1 ], operator: '!' },
};

const COMPARISONS = {
  eq: '=',
  ne: '!=',
  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>=',
  '=': '=',
  '!=': '!=',
  '<': '<',
  '<=': '<=',
  '>': '>',
  '>=': '>=',
};

/**
 * Remove (possibly nested) XPath comments.
 * @param {string} xpath
 */
function stripComments(xpath) {
  let result = '';
  let depth = 0;
  let quote;
  for (let i = 0; i < xpath.length; i++) {
    const char = xpath[i];
    if (depth === 0 && quote) {
      result += char;
      if (char === quote) {
        quote = undefined;
      }
    } else if (xpath.startsWith('(:', i)) {
      depth++;
      i++;
    } else if (depth > 0 && xpath.startsWith(':)', i)) {
      depth--;
      i++;
      result += ' ';
    } else if (depth === 0) {
      if (char === '"' || char === '\'') {
        quote = char;
      }
      result += char;
    }
  }
  return result;
}

const TOKEN = new RegExp([
  // Whitespace
  String.raw`(?<space>\s+)`,
  // Numeric literals, where a double has an exponent and a decimal has a dot,
  // and which must not be directly followed by a name (https://www.w3.org/TR/xpath-31/#id-terminal-delimitation)
  String.raw`(?<double>(?:\.\d+|\d+(?:\.\d*)?)[eE][+-]?\d+(?![A-Za-z_]))`,
  String.raw`(?<decimal>(?:\.\d+|\d+\.\d*)(?![A-Za-z_]))`,
  String.raw`(?<integer>\d+(?![\d.A-Za-z_]))`,
  // String literals, where a doubled quote escapes the quote
  String.raw`(?<string>"(?:[^"]|"")*"|'(?:[^']|'')*')`,
  // Variable references and (prefixed) names
  String.raw`(?<variable>\$[A-Za-z_][\w.-]*)`,
  String.raw`(?<name>[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)`,
  // Symbols, longest first
  String.raw`(?<symbol>!=|<=|>=|\|\||[-+*(),<>=?!|/\[\]{}#@.;:])`,
].join('|'), 'uy');

/**
 * @param {string} xpath
 */
function tokenize(xpath) {
  const tokens = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < xpath.length) {
    const match = TOKEN.exec(xpath);
    if (!match) {
      throw new UnsupportedError(`Unknown token at ${TOKEN.lastIndex}`);
    }
    const [ type, value ] = Object.entries(match.groups).find(([ , val ]) => val !== undefined);
    if (type !== 'space') {
      tokens.push({ type, value });
    }
  }
  return tokens;
}

/**
 * A recursive descent parser for the subset of XPath 3.1 that maps onto SPARQL expressions,
 * which produces SPARQL algebra (https://www.w3.org/TR/xpath-31/#id-grammar).
 */
class Parser {
  /**
   * @param {string} xpath The XPath expression.
   * @param {Record<string, any>} variables Algebra expressions to substitute variable references with.
   */
  constructor(xpath, variables) {
    this.tokens = tokenize(stripComments(xpath));
    this.position = 0;
    this.variables = variables;
  }

  parse() {
    const expression = this.orExpr();
    if (this.peek()) {
      throw new UnsupportedError(`Unsupported token ${this.peek().value}`);
    }
    return expression;
  }

  peek(offset = 0) {
    return this.tokens[this.position + offset];
  }

  isName(value, offset = 0) {
    const token = this.peek(offset);
    return token?.type === 'name' && token.value === value;
  }

  isSymbol(value, offset = 0) {
    const token = this.peek(offset);
    return token?.type === 'symbol' && token.value === value;
  }

  expectSymbol(value) {
    if (!this.isSymbol(value)) {
      throw new UnsupportedError(`Expected ${value}`);
    }
    this.position++;
  }

  orExpr() {
    let left = this.andExpr();
    while (this.isName('or')) {
      this.position++;
      left = AF.createOperatorExpression('||', [ left, this.andExpr() ]);
    }
    return left;
  }

  andExpr() {
    let left = this.comparisonExpr();
    while (this.isName('and')) {
      this.position++;
      left = AF.createOperatorExpression('&&', [ left, this.comparisonExpr() ]);
    }
    return left;
  }

  comparisonExpr() {
    const left = this.additiveExpr();
    const token = this.peek();
    if (token && (token.type === 'name' || token.type === 'symbol') && COMPARISONS[token.value]) {
      this.position++;
      return AF.createOperatorExpression(COMPARISONS[token.value], [ left, this.additiveExpr() ]);
    }
    return left;
  }

  additiveExpr() {
    let left = this.multiplicativeExpr();
    while (this.isSymbol('+') || this.isSymbol('-')) {
      const operator = this.peek().value;
      this.position++;
      left = AF.createOperatorExpression(operator, [ left, this.multiplicativeExpr() ]);
    }
    return left;
  }

  multiplicativeExpr() {
    let left = this.castExpr();
    while (this.isSymbol('*') || this.isName('div')) {
      const operator = this.isSymbol('*') ? '*' : '/';
      this.position++;
      left = AF.createOperatorExpression(operator, [ left, this.castExpr() ]);
    }
    return left;
  }

  castExpr() {
    const expression = this.unaryExpr();
    if (this.isName('cast') && this.isName('as', 1)) {
      this.position += 2;
      const type = this.peek();
      if (type?.type !== 'name' || this.isSymbol('?', 1)) {
        throw new UnsupportedError('Unsupported cast type');
      }
      this.position++;
      return this.cast(type.value, expression);
    }
    return expression;
  }

  unaryExpr() {
    if (this.isSymbol('-') || this.isSymbol('+')) {
      const operator = this.peek().value === '-' ? 'uminus' : 'uplus';
      this.position++;
      return AF.createOperatorExpression(operator, [ this.unaryExpr() ]);
    }
    return this.primaryExpr();
  }

  primaryExpr() {
    const token = this.peek();
    if (!token) {
      throw new UnsupportedError('Unexpected end of expression');
    }
    this.position++;
    switch (token.type) {
      case 'integer':
        return AF.createTermExpression(DF.literal(token.value, DF.namedNode(`${XSD}integer`)));
      case 'decimal':
        return AF.createTermExpression(DF.literal(token.value, DF.namedNode(`${XSD}decimal`)));
      case 'double':
        return AF.createTermExpression(DF.literal(token.value, DF.namedNode(`${XSD}double`)));
      case 'string':
        return AF.createTermExpression(DF.literal(token.value.slice(1, -1)
          .replaceAll(token.value[0] + token.value[0], token.value[0])));
      case 'variable': {
        const variable = this.variables[token.value.slice(1)];
        if (!variable) {
          throw new UnsupportedError(`Unknown variable ${token.value}`);
        }
        return variable;
      }
      case 'symbol':
        if (token.value === '(') {
          const expression = this.orExpr();
          this.expectSymbol(')');
          return expression;
        }
        break;
      case 'name':
        if (token.value === 'if' && this.isSymbol('(')) {
          return this.ifExpr();
        }
        if (this.isSymbol('(')) {
          return this.functionCall(token.value);
        }
        break;
    }
    throw new UnsupportedError(`Unsupported token ${token.value}`);
  }

  ifExpr() {
    this.expectSymbol('(');
    const condition = this.orExpr();
    this.expectSymbol(')');
    if (!this.isName('then')) {
      throw new UnsupportedError('Expected then');
    }
    this.position++;
    const thenExpression = this.orExpr();
    if (!this.isName('else')) {
      throw new UnsupportedError('Expected else');
    }
    this.position++;
    return AF.createOperatorExpression('if', [ condition, thenExpression, this.orExpr() ]);
  }

  functionCall(name) {
    this.expectSymbol('(');
    const args = [];
    if (!this.isSymbol(')')) {
      args.push(this.orExpr());
      while (this.isSymbol(',')) {
        this.position++;
        args.push(this.orExpr());
      }
    }
    this.expectSymbol(')');

    const [ prefix, localName ] = name.includes(':') ? name.split(':') : [ 'fn', name ];
    if (prefix === 'xs' && args.length === 1) {
      return this.cast(name, args[0]);
    }
    if (prefix !== 'fn') {
      throw new UnsupportedError(`Unsupported function ${name}`);
    }
    if ((localName === 'true' || localName === 'false') && args.length === 0) {
      return AF.createTermExpression(DF.literal(localName, DF.namedNode(`${XSD}boolean`)));
    }
    if (localName === 'boolean' && args.length === 1) {
      // The effective boolean value, as negating twice
      return AF.createOperatorExpression('!', [ AF.createOperatorExpression('!', args) ]);
    }
    if (localName === 'string' && args.length === 1) {
      // The string value of an atomic value is its cast to xs:string
      return this.cast('xs:string', args[0]);
    }
    if (localName === 'concat' && args.length >= 2) {
      // XPath converts the arguments to strings, while SPARQL only accepts strings
      return AF.createOperatorExpression('concat', args.map(arg => this.cast('xs:string', arg)));
    }
    const definition = FUNCTIONS[localName];
    if (!definition?.arities.includes(args.length)) {
      throw new UnsupportedError(`Unsupported function ${name}#${args.length}`);
    }
    return AF.createOperatorExpression(definition.operator, args);
  }

  cast(typeName, expression) {
    const [ prefix, localName ] = typeName.split(':');
    if (prefix !== 'xs') {
      throw new UnsupportedError(`Unsupported cast type ${typeName}`);
    }
    if (CAST_TYPES.has(localName)) {
      return AF.createNamedExpression(DF.namedNode(`${XSD}${localName}`), [ expression ]);
    }
    // Integer types have no cast function, but a string literal can become a typed literal.
    // Other types, such as xs:untypedAtomic and xs:anyURI, are not SPARQL operand types.
    if (INTEGER_TYPES.has(localName) && expression.subType === 'term' && expression.term.termType === 'Literal' &&
      expression.term.datatype.value === `${XSD}string`) {
      return AF.createTermExpression(DF.literal(expression.term.value, DF.namedNode(`${XSD}${localName}`)));
    }
    throw new UnsupportedError(`Unsupported cast type ${typeName}`);
  }
}

/**
 * Translate an XPath expression into SPARQL algebra.
 * @param {string} xpath The XPath expression.
 * @param {Record<string, any>} variables Algebra expressions to substitute variable references with.
 * @throws {UnsupportedError} If the expression has no SPARQL equivalent.
 */
function xpathToAlgebra(xpath, variables = {}) {
  return new Parser(xpath, variables).parse();
}

module.exports = { xpathToAlgebra, UnsupportedError, AF, DF, XSD };
