import { RmlEngineBase } from '@comunica/actor-init-rml';
import type { ActorInitRml } from '@comunica/actor-init-rml';

// eslint-disable-next-line ts/no-require-imports,ts/no-var-requires,import/extensions
const engineDefault = require('../engine-default.js');

/**
 * A Comunica engine for materializing RML mappings into the quads they generate.
 */
export class RmlEngine extends RmlEngineBase {
  public constructor(engine: ActorInitRml = engineDefault()) {
    super(engine);
  }
}
