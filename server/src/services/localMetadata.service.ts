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

  private saveMutex = new Mutex();

  getOverride(docId: string): MetadataOverride | undefined {
    return this.overrides[docId];
  }

  getAllOverrides(): Record<string, MetadataOverride> {
    return { ...this.overrides };
  }

  async setOverride(docId: string, metadata: MetadataOverride) {
    this.overrides[docId] = {
      ...this.overrides[docId],
      ...metadata
    };
    await this.save();
  }

  private async save() {
    const release = await this.saveMutex.acquire();
    const tempFile = this.STORAGE_PATH + '.tmp';
    const backupFile = this.STORAGE_PATH + '.bak';

    try {
      // 1. Write to temp file
      await fs.promises.writeFile(tempFile, JSON.stringify(this.overrides, null, 2));

      // 2. Create backup of current
      if (fs.existsSync(this.STORAGE_PATH)) {
        await fs.promises.copyFile(this.STORAGE_PATH, backupFile);
      }

      // 3. Atomic rename with retry for Windows
      let retries = 3;
      while (retries > 0) {
        try {
          await fs.promises.rename(tempFile, this.STORAGE_PATH);
          break;
        } catch (e: any) {
          if (retries === 1 || (e.code !== 'EPERM' && e.code !== 'EBUSY')) throw e;
          retries--;
          await new Promise(r => setTimeout(r, 100));
        }
      }

      // 4. Success cleanup
      if (fs.existsSync(backupFile)) await fs.promises.unlink(backupFile);
    } catch (e) {
      console.error('LocalMetadataService: Failed to save overrides atomically', e);
      // Attempt quick fallback if main is gone but backup exists
      if (!fs.existsSync(this.STORAGE_PATH) && fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, this.STORAGE_PATH);
      }
    } finally {
      release();
    }
  }
}

/**
 * Simple Mutex implementation for preventing race conditions
 */
class Mutex {
  private queue: ((releaseFn: () => void) => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    let releaseFn: () => void;

    const p = new Promise<() => void>((resolve) => {
      releaseFn = () => {
        this.locked = false;
        if (this.queue.length > 0) {
          const nextResolve = this.queue.shift()!;
          this.locked = true;
          nextResolve(releaseFn!);
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(releaseFn!);
      } else {
        this.queue.push((r) => resolve(r));
      }
    });

    return p;
  }
}
