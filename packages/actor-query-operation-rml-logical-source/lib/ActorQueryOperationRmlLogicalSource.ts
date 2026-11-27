import type { MediatorDereference } from '@comunica/bus-dereference';
import type { MediatorMergeBindingsContext } from '@comunica/bus-merge-bindings-context';
import type { IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { ActorQueryOperationTypedMediated } from '@comunica/bus-query-operation';
import type { MediatorRmlReferenceFormulation, RmlReferencedValues } from '@comunica/bus-rml-reference-formulation';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';
import type {
  Bindings,
  BindingsStream,
  ComunicaDataFactory,
  IActionContext,
  IQueryOperationResult,
  MetadataBindings,
} from '@comunica/types';
import type { Algebra } from '@comunica/utils-algebra';
import { TypesComunica } from '@comunica/utils-algebra';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';

/**
 * A comunica RML Logical Source Query Operation Actor.
 * It evaluates the source operator of the RML algebra.
 */
export class ActorQueryOperationRmlLogicalSource extends ActorQueryOperationTypedMediated<Algebra.RmlLogicalSource> {
  public readonly mediatorDereference: MediatorDereference;
  public readonly mediatorRmlReferenceFormulation: MediatorRmlReferenceFormulation;
  public readonly mediatorMergeBindingsContext: MediatorMergeBindingsContext;

  public constructor(args: IActorQueryOperationRmlLogicalSourceArgs) {
    super(args, TypesComunica.RML_LOGICAL_SOURCE);
    this.mediatorDereference = args.mediatorDereference;
    this.mediatorRmlReferenceFormulation = args.mediatorRmlReferenceFormulation;
    this.mediatorMergeBindingsContext = args.mediatorMergeBindingsContext;
  }

  public async testOperation(): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async runOperation(operation: Algebra.RmlLogicalSource, context: IActionContext):
  Promise<IQueryOperationResult> {
    const dataFactory: ComunicaDataFactory = context.getSafe(KeysInitQuery.dataFactory);
    const bindingsFactory = await BindingsFactory.create(this.mediatorMergeBindingsContext, context, dataFactory);

    const { data } = await this.mediatorDereference.mediate({ url: operation.sourceUrl, context });
    const { referencedValues } = await this.mediatorRmlReferenceFormulation.mediate({
      referenceFormulation: operation.referenceFormulation,
      data,
      iterator: operation.iterator,
      references: [ ...new Set(operation.references.map(({ reference }) => reference)) ],
      context,
    });

    const bindingsStream: BindingsStream = referencedValues.transform<Bindings>({
      autoStart: false,
      transform(recordValues, done, push) {
        for (const bindings of ActorQueryOperationRmlLogicalSource
          .getRecordBindings(recordValues, operation.references, bindingsFactory, dataFactory)) {
          push(bindings);
        }
        done();
      },
    });
    const metadata = async(): Promise<MetadataBindings> => ({
      state: new MetadataValidationState(),
      cardinality: { type: 'estimate', value: Number.POSITIVE_INFINITY },
      variables: operation.references.map(({ variable }) => ({ variable, canBeUndef: true })),
    });
    return { type: 'bindings', bindingsStream, metadata };
  }

  /**
   * Create the bindings of a single record, as the Cartesian product of the values of each reference.
   * @param recordValues The referenced values of the record.
   * @param references The references and the variables to bind their values to.
   * @param bindingsFactory The factory to create bindings with.
   * @param dataFactory The factory to create literals with.
   * @return One bindings object per combination of values, where a reference without values stays unbound.
   */
  public static getRecordBindings(
    recordValues: RmlReferencedValues,
    references: Algebra.RmlLogicalSourceReference[],
    bindingsFactory: BindingsFactory,
    dataFactory: ComunicaDataFactory,
  ): Bindings[] {
    let recordBindings: Bindings[] = [ bindingsFactory.bindings() ];
    for (const { variable, reference } of references) {
      const values = recordValues[reference];
      if (values) {
        recordBindings = recordBindings.flatMap(bindings => values
          .map(value => bindings.set(variable, dataFactory.literal(value))));
      }
    }
    return recordBindings;
  }
}

export interface IActorQueryOperationRmlLogicalSourceArgs extends IActorQueryOperationTypedMediatedArgs {
  /**
   * The mediator to fetch the data of a logical source with.
   */
  mediatorDereference: MediatorDereference;
  /**
   * The mediator to evaluate the iterator and references of a logical source with.
   */
  mediatorRmlReferenceFormulation: MediatorRmlReferenceFormulation;
  /**
   * A mediator for creating binding context merge handlers
   */
  mediatorMergeBindingsContext: MediatorMergeBindingsContext;
}
