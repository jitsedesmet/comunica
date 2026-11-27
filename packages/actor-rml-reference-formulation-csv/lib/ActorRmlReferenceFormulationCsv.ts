import type {
  IActionRmlReferenceFormulation,
  IActorRmlReferenceFormulationArgs,
  IActorRmlReferenceFormulationOutput,
  RmlReferencedValues,
} from '@comunica/bus-rml-reference-formulation';
import { ActorRmlReferenceFormulation } from '@comunica/bus-rml-reference-formulation';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import type { AsyncIterator } from 'asynciterator';
import { wrap } from 'asynciterator';
import { parse } from 'csv-parse';
import { pipeline } from 'readable-stream';

/**
 * A comunica CSV RML Reference Formulation Actor.
 * Each row is a record, and a reference is a column name.
 */
export class ActorRmlReferenceFormulationCsv extends ActorRmlReferenceFormulation {
  public static readonly REFERENCE_FORMULATION_CSV = 'http://w3id.org/rml/CSV';

  public constructor(args: IActorRmlReferenceFormulationArgs) {
    super(args);
  }

  public async test(action: IActionRmlReferenceFormulation): Promise<TestResult<IActorTest>> {
    if (action.referenceFormulation !== ActorRmlReferenceFormulationCsv.REFERENCE_FORMULATION_CSV) {
      return failTest(`${this.name} only supports the reference formulation ${
        ActorRmlReferenceFormulationCsv.REFERENCE_FORMULATION_CSV}`);
    }
    return passTestVoid();
  }

  public async run(action: IActionRmlReferenceFormulation): Promise<IActorRmlReferenceFormulationOutput> {
    const { data, references } = action;
    // Closing the rows also closes the data, and an error of the data is emitted by the rows
    const parser = pipeline(data, parse({ columns: true, bom: true, skipEmptyLines: true }), () => {
      // Errors are emitted by the parser
    });
    const rows: AsyncIterator<Record<string, string>> = wrap(parser, { autoStart: false });
    return {
      referencedValues: rows.map(row => ActorRmlReferenceFormulationCsv.getReferencedValues(row, references)),
    };
  }

  /**
   * Select the referenced columns of a row, where an empty cell counts as no value.
   * @param row The cells of a row by column name.
   * @param references The column names to select.
   * @return The referenced values of the row.
   */
  public static getReferencedValues(row: Record<string, string>, references: string[]): RmlReferencedValues {
    const referencedValues: RmlReferencedValues = {};
    for (const reference of references) {
      if (row[reference]) {
        referencedValues[reference] = [ row[reference] ];
      }
    }
    return referencedValues;
  }
}
