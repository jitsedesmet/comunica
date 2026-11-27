import type { IAction, IActorArgs, IActorOutput, IActorTest, Mediate } from '@comunica/core';
import { Actor } from '@comunica/core';
import type { AsyncIterator } from 'asynciterator';

/**
 * A comunica actor for rml-reference-formulation events.
 *
 * Actor types:
 * * Input:  IActionRmlReferenceFormulation:      The data of a logical source, and the references to evaluate on it.
 * * Test:   <none>
 * * Output: IActorRmlReferenceFormulationOutput: The referenced values of each record in the data.
 *
 * @see IActionRmlReferenceFormulation
 * @see IActorRmlReferenceFormulationOutput
 */
export abstract class ActorRmlReferenceFormulation<TS = undefined>
  extends Actor<IActionRmlReferenceFormulation, IActorTest, IActorRmlReferenceFormulationOutput, TS> {
  /* eslint-disable max-len */
  /**
   * @param args -
   *   \ @defaultNested {<default_bus> a <cc:components/Bus.jsonld#Bus>} bus
   *   \ @defaultNested {RML reference formulation failed: no configured actor supports the reference formulation ${action.referenceFormulation}} busFailMessage
   */
  /* eslint-enable max-len */
  public constructor(args: IActorRmlReferenceFormulationArgs<TS>) {
    super(args);
  }
}

/**
 * The values of each reference in a single record, where a reference without a value has no entry.
 */
export type RmlReferencedValues = Record<string, string[]>;

export interface IActionRmlReferenceFormulation extends IAction {
  /**
   * The IRI of the language the iterator and references are written in.
   */
  referenceFormulation: string;
  /**
   * The raw data of the logical source.
   */
  data: NodeJS.ReadableStream;
  /**
   * The expression selecting the records of the data, if the reference formulation needs one.
   */
  iterator?: string;
  /**
   * The references to evaluate on each record.
   */
  references: string[];
}

export interface IActorRmlReferenceFormulationOutput extends IActorOutput {
  /**
   * The referenced values of each record, in the order of the data.
   */
  referencedValues: AsyncIterator<RmlReferencedValues>;
}

export type IActorRmlReferenceFormulationArgs<TS = undefined> = IActorArgs<
IActionRmlReferenceFormulation,
IActorTest,
IActorRmlReferenceFormulationOutput,
TS
>;

export type MediatorRmlReferenceFormulation = Mediate<
IActionRmlReferenceFormulation,
IActorRmlReferenceFormulationOutput
>;
