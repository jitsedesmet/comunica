import { ActorQueryOperation } from '@comunica/bus-query-operation';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { AlgebraFactory } from '@comunica/utils-algebra';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { getSafeBindings } from '@comunica/utils-query-operation';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorQueryOperationRmlLogicalSource } from '../lib/ActorQueryOperationRmlLogicalSource';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);
const BF = new BindingsFactory(DF);

describe('ActorQueryOperationRmlLogicalSource', () => {
  let actor: ActorQueryOperationRmlLogicalSource;
  let context: IActionContext;
  let mediatorDereference: any;
  let mediatorRmlReferenceFormulation: any;

  beforeEach(() => {
    mediatorDereference = { mediate: jest.fn(async() => ({ data: 'data stream' })) };
    mediatorRmlReferenceFormulation = {
      mediate: jest.fn(async() => ({
        referencedValues: new ArrayIterator([
          { id: [ '1' ], tag: [ 'a', 'b' ]},
          { id: [ '2' ]},
        ], { autoStart: false }),
      })),
    };
    actor = new ActorQueryOperationRmlLogicalSource({
      name: 'actor',
      bus: new Bus({ name: 'bus' }),
      mediatorQueryOperation: <any> {},
      mediatorDereference,
      mediatorRmlReferenceFormulation,
      mediatorMergeBindingsContext: <any> { mediate: () => ({}) },
    });
    context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
  });

  it('should be an ActorQueryOperation', () => {
    expect(actor).toBeInstanceOf(ActorQueryOperation);
  });

  it('should test on RML logical sources', async() => {
    await expect(actor.test({ operation: AF.createRmlLogicalSource('data.csv', 'ex:CSV', []), context }))
      .resolves.toPassTestVoid();
  });

  it('should not test on other operations', async() => {
    await expect(actor.test({ operation: AF.createNop(), context })).resolves.toFailTest(
      'Actor actor only supports rmllogicalsource operations, but got nop',
    );
  });

  it('should bind every combination of the referenced values of each record', async() => {
    const operation = AF.createRmlLogicalSource('data.csv', 'ex:CSV', [
      { variable: DF.variable('id'), reference: 'id' },
      { variable: DF.variable('sameId'), reference: 'id' },
      { variable: DF.variable('tag'), reference: 'tag' },
    ], 'rows');
    const output = getSafeBindings(await actor.run({ operation, context }, undefined));

    expect(mediatorDereference.mediate).toHaveBeenCalledWith(expect.objectContaining({ url: 'data.csv' }));
    expect(mediatorRmlReferenceFormulation.mediate).toHaveBeenCalledWith(expect.objectContaining({
      referenceFormulation: 'ex:CSV',
      data: 'data stream',
      iterator: 'rows',
      references: [ 'id', 'tag' ],
    }));
    await expect(output.metadata()).resolves.toMatchObject({
      cardinality: { type: 'estimate', value: Number.POSITIVE_INFINITY },
      variables: [
        { variable: DF.variable('id'), canBeUndef: true },
        { variable: DF.variable('sameId'), canBeUndef: true },
        { variable: DF.variable('tag'), canBeUndef: true },
      ],
    });
    await expect(output.bindingsStream).toEqualBindingsStream([
      BF.bindings([
        [ DF.variable('id'), DF.literal('1') ],
        [ DF.variable('sameId'), DF.literal('1') ],
        [ DF.variable('tag'), DF.literal('a') ],
      ]),
      BF.bindings([
        [ DF.variable('id'), DF.literal('1') ],
        [ DF.variable('sameId'), DF.literal('1') ],
        [ DF.variable('tag'), DF.literal('b') ],
      ]),
      BF.bindings([
        [ DF.variable('id'), DF.literal('2') ],
        [ DF.variable('sameId'), DF.literal('2') ],
      ]),
    ]);
  });
});
