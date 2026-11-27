import type { IActionInit, IActorInitArgs, IActorOutputInit } from '@comunica/bus-init';
import { ActorInit } from '@comunica/bus-init';
import type { MediatorQueryOperation } from '@comunica/bus-query-operation';
import type { MediatorQueryParse } from '@comunica/bus-query-parse';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';

/**
 * A comunica RML Init Actor.
 * It exposes the mediators that an {@link RmlEngineBase} materializes RML mappings with.
 */
export class ActorInitRml extends ActorInit {
  public readonly mediatorQueryParse: MediatorQueryParse;
  public readonly mediatorQueryOperation: MediatorQueryOperation;

  public constructor(args: IActorInitRmlArgs) {
    super(args);
    this.mediatorQueryParse = args.mediatorQueryParse;
    this.mediatorQueryOperation = args.mediatorQueryOperation;
  }

  public async test(_action: IActionInit): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(_action: IActionInit): Promise<IActorOutputInit> {
    throw new Error('ActorInitRml#run is not supported, use an RmlEngineBase instead.');
  }
}

export interface IActorInitRmlArgs extends IActorInitArgs {
  /**
   * The mediator to translate an RML mapping into an operation with.
   */
  mediatorQueryParse: MediatorQueryParse;
  /**
   * The mediator to evaluate the operation of an RML mapping with.
   */
  mediatorQueryOperation: MediatorQueryOperation;
}
