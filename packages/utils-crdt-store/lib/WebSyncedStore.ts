import { DataFactory, Parser } from 'n3';
import { RdfStore } from 'rdf-stores';
import { CrdtStore } from './CrdtStore';
import type { DataFactoryUuid } from './DataFactoryUuid';
import { eventToPromise } from './utils';
import triple = DataFactory.triple;
import { wrap } from 'asynciterator';

export interface WebSyncedStoreOptions {
  fetch?: typeof fetch;
  dataFactory: DataFactoryUuid;
  webSource: string;
}

/**
 * A CrdtStore that self-manages external synchronization
 */
export class WebSyncedStore extends CrdtStore {
  protected fetch: typeof fetch;
  protected webSource: string;
  protected parser: Parser;
  protected remoteEtag = '';

  public constructor(option: WebSyncedStoreOptions) {
    super(option.dataFactory);
    this.fetch = option.fetch ?? fetch;
    this.webSource = option.webSource;
    this.parser = new Parser({ factory: <any> this.DF, format: 'N-Quads' });
  }

  public async pullData(): Promise<void> {
    const remote = await this.fetch(this.webSource);
    const etag = remote.headers.get('etag');
    if (!etag) {
      throw new Error('No etag found for WebSynced store');
    }
    this.remoteEtag = etag;
    const remoteText = await remote.text();
    const triples = this.parser.parse(remoteText);

    const remoteStore = RdfStore.createDefault();
    await eventToPromise(remoteStore.import(wrap(triples)));

    await eventToPromise(this.crdtMerge(remoteStore));
  }
}
