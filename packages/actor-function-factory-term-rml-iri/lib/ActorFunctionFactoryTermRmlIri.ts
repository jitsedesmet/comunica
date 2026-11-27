import type {
  IActionFunctionFactory,
  IActorFunctionFactoryArgs,
  IActorFunctionFactoryOutput,
  IActorFunctionFactoryOutputTerm,
} from '@comunica/bus-function-factory';
import {
  ActorFunctionFactoryDedicated,
} from '@comunica/bus-function-factory';
import { TermFunctionRmlEncodeForIri } from './TermFunctionRmlEncodeForIri';
import { TermFunctionRmlToIri } from './TermFunctionRmlToIri';

/**
 * A comunica TermFunctionRmlIri Function Factory Actor.
 */
export class ActorFunctionFactoryTermRmlIri extends ActorFunctionFactoryDedicated {
  public constructor(args: IActorFunctionFactoryArgs) {
    super({
      ...args,
      functionNames: [ TermFunctionRmlToIri.FUNCTION_NAME, TermFunctionRmlEncodeForIri.FUNCTION_NAME ],
      termFunction: true,
    });
  }

  public async run<T extends IActionFunctionFactory>(action: T):
  Promise<T extends { requireTermExpression: true } ? IActorFunctionFactoryOutputTerm : IActorFunctionFactoryOutput> {
    return action.functionName === TermFunctionRmlToIri.FUNCTION_NAME ?
      new TermFunctionRmlToIri() :
      new TermFunctionRmlEncodeForIri();
  }
}
