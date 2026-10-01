import { TermFunctionBase } from '@comunica/bus-function-factory';
import type {
  BigNumber,
  DirLangStringLiteral,
  IntegerLiteral,
  LangStringLiteral,
} from '@comunica/utils-expression-evaluator';
import {
  declare,
  dirLangString,
  langString,
  SparqlOperator,
  string,
  TypeURL,
} from '@comunica/utils-expression-evaluator';

/**
 * https://www.w3.org/TR/sparql11-query/#func-substr
 */
export class TermFunctionSubStr extends TermFunctionBase {
  public constructor() {
    super({
      arity: [ 2, 3 ],
      operator: SparqlOperator.SUBSTR,
      overloads: declare(SparqlOperator.SUBSTR)
        .onBinaryTyped(
          [ TypeURL.XSD_STRING, TypeURL.XSD_INTEGER ],
          () => (source: string, startingLoc: BigNumber) =>
            string([ ...source ].slice(startingLoc.toNumber() - 1).join('')),
        )
        .onBinary(
          [ TypeURL.RDF_LANG_STRING, TypeURL.XSD_INTEGER ],
          () => (source: LangStringLiteral, startingLoc: IntegerLiteral) => {
            const sub = [ ...source.typedValue ].slice(startingLoc.toNumber() - 1).join('');
            return langString(sub, source.language);
          },
        )
        .onBinary(
          [ TypeURL.RDF_DIR_LANG_STRING, TypeURL.XSD_INTEGER ],
          () => (source: DirLangStringLiteral, startingLoc: IntegerLiteral) => {
            const sub = [ ...source.typedValue ].slice(startingLoc.toNumber() - 1).join('');
            return dirLangString(sub, source.language, source.direction);
          },
        )
        .onTernaryTyped(
          [ TypeURL.XSD_STRING, TypeURL.XSD_INTEGER, TypeURL.XSD_INTEGER ],
          () => (source: string, startingLoc: BigNumber, length: BigNumber) =>
            string([ ...source ].slice(startingLoc.toNumber() - 1, length.plus(startingLoc).toNumber() - 1).join('')),
        )
        .onTernary(
          [ TypeURL.RDF_LANG_STRING, TypeURL.XSD_INTEGER, TypeURL.XSD_INTEGER ],
          () => (source: LangStringLiteral, startingLoc: IntegerLiteral, length: IntegerLiteral) => {
            const sub = [ ...source.typedValue ]
              .slice(startingLoc.toNumber() - 1, length.typedValue.plus(startingLoc.typedValue).toNumber() - 1)
              .join('');
            return langString(sub, source.language);
          },
        )
        .onTernary(
          [ TypeURL.RDF_DIR_LANG_STRING, TypeURL.XSD_INTEGER, TypeURL.XSD_INTEGER ],
          () => (source: DirLangStringLiteral, startingLoc: IntegerLiteral, length: IntegerLiteral) => {
            const sub = [ ...source.typedValue ]
              .slice(startingLoc.toNumber() - 1, length.typedValue.plus(startingLoc.typedValue).toNumber() - 1)
              .join('');
            return dirLangString(sub, source.language, source.direction);
          },
        )
        .collect(),
    });
  }
}
