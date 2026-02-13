export interface MetadataOverride {
  title?: string;
  category?: string;
  sensitivity?: string;
  department?: string;
  roles?: string;
  owner?: string;
  link?: string;
  docId?: string;
  id?: string;
  values?: number[];
  __vectorEntry?: boolean;
  [key: string]: unknown;
}

export interface MetadataStore {
  getOverride(docId: string): MetadataOverride | undefined;
  getAllOverrides(): Record<string, MetadataOverride>;
  setOverride(docId: string, metadata: MetadataOverride): Promise<void>;
  removeOverride(docId: string): Promise<void>;
  removeOverrides(docIds: string[]): Promise<void>;
  checkHealth(): boolean;
  disconnect?(): void;
  listDocuments?(params: { department?: string; limit?: number; offset?: number }): Promise<MetadataOverride[]>;
  listVectorEntries?(params: { limit?: number; offset?: number }): Promise<Array<{ id: string; data: MetadataOverride }>>;
}
