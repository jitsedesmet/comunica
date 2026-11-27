import type {
  IActionRmlReferenceFormulation,
  IActorRmlReferenceFormulationArgs,
  IActorRmlReferenceFormulationOutput,
  RmlReferencedValues,
} from '@comunica/bus-rml-reference-formulation';
import {
  ActorRmlReferenceFormulation,
  RML_REFERENCE_FORMULATION_JSONPATH,
} from '@comunica/bus-rml-reference-formulation';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import type { ComunicaDataFactory } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { ArrayIterator } from 'asynciterator';
import { JSONPath } from 'jsonpath-plus';

const XSD = 'http://www.w3.org/2001/XMLSchema#';

/**
 * A comunica JSONPath RML Reference Formulation Actor.
 * The iterator selects the records in a JSON document, and a reference selects values within a record.
 */
export class ActorRmlReferenceFormulationJsonPath extends ActorRmlReferenceFormulation {
  public constructor(args: IActorRmlReferenceFormulationArgs) {
    super(args);
  }

  public async test(action: IActionRmlReferenceFormulation): Promise<TestResult<IActorTest>> {
    if (action.referenceFormulation !== RML_REFERENCE_FORMULATION_JSONPATH) {
      return failTest(`${this.name} only supports the reference formulation ${RML_REFERENCE_FORMULATION_JSONPATH}`);
    }
    return passTestVoid();
  }

  public async run(action: IActionRmlReferenceFormulation): Promise<IActorRmlReferenceFormulationOutput> {
    const dataFactory: ComunicaDataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
    const chunks: string[] = [];
    for await (const chunk of action.data) {
      chunks.push(chunk.toString());
    }
    const records: unknown[] = ActorRmlReferenceFormulationJsonPath
      .evaluate(action.iterator ?? '$', JSON.parse(chunks.join('')));

    const referencedValues: AsyncIterator<RmlReferencedValues> = new ArrayIterator(records, { autoStart: false })
      .transform({
        autoStart: false,
        transform(record, done, push) {
          try {
            push(ActorRmlReferenceFormulationJsonPath.getReferencedValues(record, action.references, dataFactory));
          } catch (error: unknown) {
            referencedValues.destroy(<Error> error);
          }
          done();
        },
      });
    return { referencedValues };
  }

  /**
   * Evaluate the references on a record.
   * @param record The JSON value of a record.
   * @param references The JSONPath expressions to evaluate.
   * @param dataFactory The factory to create literals with.
   * @return The referenced values of the record.
   */
  public static getReferencedValues(
    record: unknown,
    references: string[],
    dataFactory: ComunicaDataFactory,
  ): RmlReferencedValues {
    const referencedValues: RmlReferencedValues = {};
    for (const reference of references) {
      const literals = ActorRmlReferenceFormulationJsonPath.evaluate(reference, record)
        .map(value => ActorRmlReferenceFormulationJsonPath.toLiteral(value, dataFactory))
        .filter(literal => literal !== undefined);
      if (literals.length > 0) {
        referencedValues[reference] = literals;
      }
    }
    return referencedValues;
  }

  /**
   * Evaluate a JSONPath expression, without the script expressions that could run arbitrary code.
   * @param path The JSONPath expression.
   * @param json The JSON value to evaluate the expression on.
   * @return The selected values.
   */
  public static evaluate(path: string, json: unknown): unknown[] {
    return JSONPath({ path, json: <any> json, eval: false });
  }

  /**
   * Convert a JSON value to a literal with its natural datatype.
   * @param value A JSON value.
   * @param dataFactory The factory to create literals with.
   * @return The literal, or undefined for null.
   * @throws Error for an object or array, which a reference must not select.
   */
  public static toLiteral(value: unknown, dataFactory: ComunicaDataFactory): RDF.Literal | undefined {
    switch (typeof value) {
      case 'string':
        return dataFactory.literal(value);
      case 'boolean':
        return dataFactory.literal(String(value), dataFactory.namedNode(`${XSD}boolean`));
      case 'number':
        return Number.isInteger(value) ?
          dataFactory.literal(String(value), dataFactory.namedNode(`${XSD}integer`)) :
          dataFactory.literal(value.toExponential().replace('e+', 'E').replace('e', 'E'), dataFactory.namedNode(`${XSD}double`));
      default:
        if (value !== null) {
          throw new Error(`An RML reference selected a JSON object or array instead of a value: ${JSON.stringify(value)}`);
        }
        return undefined;
    }
  }
}
