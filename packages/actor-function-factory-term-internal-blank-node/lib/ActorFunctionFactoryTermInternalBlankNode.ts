import type {
  IActionFunctionFactory,
  IActorFunctionFactoryArgs,
  IActorFunctionFactoryOutput,
  IActorFunctionFactoryOutputTerm,
} from '@comunica/bus-function-factory';
import {
  ActorFunctionFactoryDedicated,
} from '@comunica/bus-function-factory';
import { TermFunctionInternalBlankNode } from './TermFunctionInternalBlankNode';

/**
 * A comunica TermFunctionInternalBlankNode Function Factory Actor.
 */
export class ActorFunctionFactoryTermInternalBlankNode extends ActorFunctionFactoryDedicated {
  public constructor(args: IActorFunctionFactoryArgs) {
    super({
      ...args,
      functionNames: [ TermFunctionInternalBlankNode.FUNCTION_NAME ],
      termFunction: true,
    });
  }

  public async run<T extends IActionFunctionFactory>(_: T):
  Promise<T extends { requireTermExpression: true } ? IActorFunctionFactoryOutputTerm : IActorFunctionFactoryOutput> {
    return new TermFunctionInternalBlankNode();
  }
}
