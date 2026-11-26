import { parseTurtle } from '@comake/rmlmapper-js';
import type { IRmlMapper } from './IRmlMapper';

/**
 * An RML mapper that is backed by `@comake/rmlmapper-js`.
 */
export class RmlMapperComake implements IRmlMapper {
  public async map(mapping: string, inputFiles: Record<string, string>): Promise<string> {
    return <string> <unknown> await parseTurtle(mapping, inputFiles, { toRDF: true });
  }
}
