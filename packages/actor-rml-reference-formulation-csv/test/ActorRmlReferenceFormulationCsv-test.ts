import { ActorRmlReferenceFormulation } from '@comunica/bus-rml-reference-formulation';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { DataFactory } from 'rdf-data-factory';
import { Readable } from 'readable-stream';
import { ActorRmlReferenceFormulationCsv } from '../lib/ActorRmlReferenceFormulationCsv';
import '@comunica/utils-jest';

const DF = new DataFactory();

describe('ActorRmlReferenceFormulationCsv', () => {
  let bus: any;
  let actor: ActorRmlReferenceFormulationCsv;
  let context: IActionContext;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    actor = new ActorRmlReferenceFormulationCsv({ name: 'actor', bus });
    context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
  });

  it('should be an ActorRmlReferenceFormulation', () => {
    expect(actor).toBeInstanceOf(ActorRmlReferenceFormulation);
  });

  describe('test', () => {
    it('should pass on the CSV reference formulation', async() => {
      await expect(actor.test({
        referenceFormulation: 'http://w3id.org/rml/CSV',
        data: Readable.from([ '' ]),
        references: [],
        context,
      })).resolves.toPassTestVoid();
    });

    it('should fail on another reference formulation', async() => {
      await expect(actor.test({
        referenceFormulation: 'http://w3id.org/rml/JSONPath',
        data: Readable.from([ '' ]),
        references: [],
        context,
      })).resolves.toFailTest('actor only supports the reference formulation http://w3id.org/rml/CSV');
    });
  });

  describe('run', () => {
    it('should give the referenced cells of each row', async() => {
      const { referencedValues } = await actor.run({
        referenceFormulation: 'http://w3id.org/rml/CSV',
        data: Readable.from([ 'id,name,city\n1,"Alice, PhD",Ghent\n\n2,Bob,\n' ]),
        references: [ 'id', 'city' ],
        context,
      });
      await expect(referencedValues.toArray()).resolves.toEqual([
        { id: [ DF.literal('1') ], city: [ DF.literal('Ghent') ]},
        { id: [ DF.literal('2') ]},
      ]);
    });

    it('should emit an error on a reference to an unknown column', async() => {
      const { referencedValues } = await actor.run({
        referenceFormulation: 'http://w3id.org/rml/CSV',
        data: Readable.from([ 'id,name\n1,Alice\n' ]),
        references: [ 'id', 'unknown' ],
        context,
      });
      await expect(referencedValues.toArray()).rejects
        .toThrow(`The CSV data has no column 'unknown', only 'id', 'name'`);
    });

    it('should emit an error on invalid CSV', async() => {
      const { referencedValues } = await actor.run({
        referenceFormulation: 'http://w3id.org/rml/CSV',
        data: Readable.from([ 'id,name\n1,Alice,Ghent\n' ]),
        references: [ 'id' ],
        context,
      });
      await expect(referencedValues.toArray()).rejects.toThrow('Invalid Record Length');
    });

    it('should emit an error of the data stream', async() => {
      const data = new Readable({ read() {
        this.destroy(new Error('data stream error'));
      } });
      const { referencedValues } = await actor.run({
        referenceFormulation: 'http://w3id.org/rml/CSV',
        data,
        references: [ 'id' ],
        context,
      });
      await expect(referencedValues.toArray()).rejects.toThrow('data stream error');
    });
  });
});
