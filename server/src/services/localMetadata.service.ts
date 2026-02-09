import path from 'path';
import { JSONStore } from '../utils/jsonStore.js';

export interface MetadataOverride {
  title?: string;
  category?: string;
  sensitivity?: string;
  department?: string;
  owner?: string;
  link?: string;
  docId?: string;
  id?: string;
  values?: number[];
  __vectorEntry?: boolean;
  [key: string]: unknown;
}

export class LocalMetadataService {
  private store: JSONStore<Record<string, MetadataOverride>>;

  constructor(storagePath?: string) {
    const defaultPath = path.join(process.cwd(), 'data', 'metadata_overrides.json');
    this.store = new JSONStore(storagePath || defaultPath, {});
  }

  getOverride(docId: string): MetadataOverride | undefined {
    return this.store.state[docId];
  }

  getAllOverrides(): Record<string, MetadataOverride> {
    return this.store.state;
  }

  async setOverride(docId: string, metadata: MetadataOverride) {
    await this.store.update(current => {
       current[docId] = {
         ...current[docId],
         ...metadata
       };
       return current;
    });
  }

  async removeOverride(docId: string) {
    await this.store.update(current => {
      if (docId in current) {
        delete current[docId];
      }
      return current;
    });
  }

  async removeOverrides(docIds: string[]) {
    await this.store.update(current => {
      docIds.forEach(docId => {
        if (docId in current) {
          delete current[docId];
        }
      });
      return current;
    });
  }
}
