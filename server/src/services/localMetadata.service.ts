import fs from 'fs';
import path from 'path';

export interface MetadataOverride {
  title?: string;
  category?: string;
  sensitivity?: string;
  department?: string;
}

export class LocalMetadataService {
  private readonly STORAGE_PATH = path.join(process.cwd(), 'data', 'metadata_overrides.json');
  private overrides: Record<string, MetadataOverride> = {};

  constructor() {
    this.init();
  }

  private init() {
    try {
      const dir = path.dirname(this.STORAGE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.STORAGE_PATH)) {
        const data = fs.readFileSync(this.STORAGE_PATH, 'utf-8');
        this.overrides = JSON.parse(data);
      } else {
        fs.writeFileSync(this.STORAGE_PATH, JSON.stringify({}));
      }
    } catch (e) {
      console.error('LocalMetadataService: Failed to initialize storage', e);
    }
  }

  getOverride(docId: string): MetadataOverride | undefined {
    return this.overrides[docId];
  }

  getAllOverrides(): Record<string, MetadataOverride> {
    return { ...this.overrides };
  }

  setOverride(docId: string, metadata: MetadataOverride) {
    this.overrides[docId] = {
      ...this.overrides[docId],
      ...metadata
    };
    this.save();
  }

  private save() {
    try {
      fs.writeFileSync(this.STORAGE_PATH, JSON.stringify(this.overrides, null, 2));
    } catch (e) {
      console.error('LocalMetadataService: Failed to save overrides', e);
    }
  }
}
