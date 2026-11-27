import { ActorRmlReferenceFormulation } from '@comunica/bus-rml-reference-formulation';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { DataFactory } from 'rdf-data-factory';
import { Readable } from 'readable-stream';
import { ActorRmlReferenceFormulationJsonPath } from '../lib/ActorRmlReferenceFormulationJsonPath';
import '@comunica/utils-jest';

const DF = new DataFactory();
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const referenceFormulation = 'http://w3id.org/rml/JSONPath';

describe('ActorRmlReferenceFormulationJsonPath', () => {
  let actor: ActorRmlReferenceFormulationJsonPath;
  let context: IActionContext;

  beforeEach(() => {
    actor = new ActorRmlReferenceFormulationJsonPath({ name: 'actor', bus: new Bus({ name: 'bus' }) });
    context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
  });

  it('should be an ActorRmlReferenceFormulation', () => {
    expect(actor).toBeInstanceOf(ActorRmlReferenceFormulation);
  });

  describe('test', () => {
    it('should pass on the JSONPath reference formulation', async() => {
      await expect(actor.test({ referenceFormulation, data: Readable.from([ '' ]), references: [], context }))
        .resolves.toPassTestVoid();
    });

    it('should fail on another reference formulation', async() => {
      await expect(actor.test({
        referenceFormulation: 'http://w3id.org/rml/CSV',
        data: Readable.from([ '' ]),
        references: [],
        context,
      })).resolves.toFailTest('actor only supports the reference formulation http://w3id.org/rml/JSONPath');
    });
  });

  describe('run', () => {
    it('should give the referenced values of each record with their natural datatype', async() => {
      const { referencedValues } = await actor.run({
        referenceFormulation,
        data: Readable.from([ '{ "people": [', `
          { "name": "Alice", "age": 30, "height": 1.75, "member": true, "tags": [ "a", "b" ], "city": null },
          { "name": "Bob" }
        ]}` ]),
        iterator: '$.people[*]',
        references: [ '$.name', '$.age', '$.height', '$.member', '$.tags[*]', '$.city' ],
        context,
      });
      await expect(referencedValues.toArray()).resolves.toEqual([
        {
          '$.name': [ DF.literal('Alice') ],
          '$.age': [ DF.literal('30', DF.namedNode(`${XSD}integer`)) ],
          '$.height': [ DF.literal('1.75E0', DF.namedNode(`${XSD}double`)) ],
          '$.member': [ DF.literal('true', DF.namedNode(`${XSD}boolean`)) ],
          '$.tags[*]': [ DF.literal('a'), DF.literal('b') ],
        },
        { '$.name': [ DF.literal('Bob') ]},
      ]);
    });

    it('should take the whole document as single record without iterator', async() => {
      const { referencedValues } = await actor.run({
        referenceFormulation,
        data: Readable.from([ '{ "name": "Alice" }' ]),
        references: [ '$.name' ],
        context,
      });
      await expect(referencedValues.toArray()).resolves.toEqual([{ '$.name': [ DF.literal('Alice') ]}]);
    });

    it('should emit an error on a reference to an object or array', async() => {
      const { referencedValues } = await actor.run({
        referenceFormulation,
        data: Readable.from([ '[{ "tags": [ "a", "b" ] }]' ]),
        iterator: '$[*]',
        references: [ '$.tags' ],
        context,
      });
      await expect(referencedValues.toArray()).rejects
        .toThrow('An RML reference selected a JSON object or array instead of a value: ["a","b"]');
    });

    it('should reject on invalid JSON', async() => {
      await expect(actor.run({ referenceFormulation, data: Readable.from([ '{' ]), references: [], context }))
        .rejects.toThrow(SyntaxError);
    });
  });
});
