import type { IBindingsAggregator } from '@comunica/bus-bindings-aggeregator-factory';
import { AggregateEvaluator } from '@comunica/bus-bindings-aggeregator-factory';
import type { IExpressionEvaluator } from '@comunica/expression-evaluator';
import { typedLiteral, TypeURL } from '@comunica/expression-evaluator';
import type * as RDF from '@rdfjs/types';

export class GroupConcatAggregator extends AggregateEvaluator implements IBindingsAggregator {
  private state: string | undefined = undefined;
  private lastLanguageValid = true;
  private lastLanguage: string | undefined = undefined;

  public static override emptyValue(): RDF.Term {
    return typedLiteral('', TypeURL.XSD_STRING);
  }

  public put(term: RDF.Term): void {
    if (this.state === undefined) {
      this.state = term.value;
      if (term.termType === 'Literal') {
        this.lastLanguage = term.language;
      }
    } else {
      this.state += this.separator + term.value;
      if (this.lastLanguageValid && term.termType === 'Literal' && this.lastLanguage !== term.language) {
        this.lastLanguageValid = false;
        this.lastLanguage = undefined;
      }
    }
  }

  public result(): RDF.Term {
    if (this.state === undefined) {
      return GroupConcat.emptyValue();
    }
    if (this.lastLanguageValid && this.lastLanguage) {
      return langString(this.state, this.lastLanguage).toRDF();
    }
    return typedLiteral(this.state, TypeURL.XSD_STRING).toRDF();
  }
}
