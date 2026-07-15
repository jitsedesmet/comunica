import { Readable } from 'node:stream';
import type {
  IActionAbstractMediaTypedHandle,
  IActorOutputAbstractMediaTypedHandle,
  IActorOutputAbstractMediaTypedMediaTypes,
} from '@comunica/actor-abstract-mediatyped';
import type { IActionParse, IActorParseOutput } from '@comunica/actor-abstract-parse';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import arrayifyStream from 'arrayify-stream';
import type { IActionDereference, IActorDereferenceOutput } from '../lib';
import { ActorDereferenceParse, emptyReadable } from '../lib';

class TestActorDereferenceParse extends ActorDereferenceParse<string> {
  public async getMetadata(): Promise<undefined> {
    return undefined;
  }
}

describe('ActorDereferenceParse', () => {
  let actor: TestActorDereferenceParse;

  beforeEach(() => {
    actor = new TestActorDereferenceParse({
      bus: new Bus({ name: 'bus' }),
      // @ts-expect-error
      mediatorDereference: {
        mediate: vi.fn(async(action: IActionDereference): Promise<IActorDereferenceOutput> => {
          if ((<any> action.context).hasRaw('invokeMediaTypes')) {
            await (<any> action).mediaTypes();
          }
          return {
            data: emptyReadable(),
            url: action.url,
            requestTime: 0,
            status: 200,
            exists: true,
            mediaType: 'text/turtle',
          };
        }),
      },
      // @ts-expect-error
      mediatorParse: {
        mediate: vi.fn(async(action: IActionAbstractMediaTypedHandle<IActionParse<any>>):
        Promise<IActorOutputAbstractMediaTypedHandle<IActorParseOutput<string, any>>> => {
          const data = new Readable({ objectMode: true, read() {
            if ((<any> action.context).hasRaw('emitParseError')) {
              this.emit('error', new Error('Parse error'));
            } else {
              this.push(null);
            }
          } });
          return { handle: { data, metadata: {}}};
        }),
      },
      // @ts-expect-error
      mediatorParseMediatypes: {
        mediate: vi.fn(async() => <IActorOutputAbstractMediaTypedMediaTypes>{ mediaTypes: { 'text/turtle': 1 }}),
      },
      mediaMappings: {},
      name: 'actor',
    });
  });

  it('should test to always pass', async() => {
    const result = await actor.test(<any> {});
    expect(result.isPassed()).toBeTruthy();
  });

  it('should allow dereference actors to invoke mediaTypes lazily', async() => {
    const context = new ActionContext({ invokeMediaTypes: true });
    await actor.run({ url: 'https://www.google.com/', context });

    expect(actor.mediatorDereference.mediate).toHaveBeenCalledTimes(1);
    expect(actor.mediatorParseMediatypes.mediate).toHaveBeenCalledTimes(1);
    expect(actor.mediatorParseMediatypes.mediate).toHaveBeenCalledWith({ context, mediaTypes: true });
  });

  it('should run and ignore parse errors in lenient mode', async() => {
    const context = new ActionContext({
      emitParseError: true,
      [KeysInitQuery.lenient.name]: true,
    });
    const spy = vi.spyOn(actor, <any> 'logWarn');
    const output = await actor.run({ url: 'https://www.google.com/', context });

    await expect(arrayifyStream(output.data)).resolves.toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
