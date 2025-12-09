import type { BaseQuad, Quad } from '@rdfjs/types';
import { CrdtStore } from './CrdtStore';

/**
 * A CrdtStore that self-manages external synchronization
 */
export class FileSyncedStore<Q extends BaseQuad = Quad> extends CrdtStore<Q> {}
