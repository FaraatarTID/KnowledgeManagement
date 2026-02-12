import { createRequire } from 'module';
import mammoth from 'mammoth';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

export class ExtractionService {
  private pdfParser: ((buffer: Buffer) => Promise<{ text: string }>) | null = null;
  private pdfParserFailed = false;
  private readonly minPdfTextChars = 40;
  private readonly maxOcrPages = 3;
  private readonly maxConcurrentOcrJobs = 2;
  private activeOcrJobs = 0;
  private ocrQueue: Array<() => void> = [];

  getOcrCapability(): { available: boolean; pdftoppm: boolean; tesseract: boolean } {
    const pdftoppm = this.isCommandAvailable('pdftoppm');
    const tesseract = this.isCommandAvailable('tesseract');
    return {
      available: pdftoppm && tesseract,
      pdftoppm,
      tesseract
    };
  }

  /**
   * Extract text from a local file based on its MIME type or extension.
   */
  async extractFromFile(filePath: string, mimeType?: string): Promise<string> {
    const buffer = await fs.promises.readFile(filePath);
    return this.extractFromBuffer(buffer, mimeType || this.guessMimeType(filePath));
  }

  /**
   * Extract text from a buffer.
   */
  async extractFromBuffer(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      if (mimeType === 'application/pdf') {
        const pdfParse = this.getPdfParser();
        if (!pdfParse) {
          console.warn('ExtractionService: PDF parser unavailable, returning empty string.');
          return '';
        }
        const data = await pdfParse(buffer);
        const extracted = (data.text || '').trim();
        if (extracted.length >= this.minPdfTextChars) {
          return extracted;
        }

        const ocrText = await this.tryPdfOcr(buffer);
        if (ocrText.trim().length > 0) {
          return ocrText.trim();
        }

        console.warn('ExtractionService: PDF appears scanned/image-only and OCR fallback was unavailable or empty.');
        return '';
      }

      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      }

      if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'application/json') {
        return buffer.toString('utf-8');
      }

      // Fallback: Try to read as text if unknown but likely text
      if (mimeType.startsWith('text/')) {
        return buffer.toString('utf-8');
      }

      console.warn(`ExtractionService: Unsupported MIME type ${mimeType}. Returning empty string.`);
      return '';
    } catch (e) {
      console.error(`ExtractionService: Failed to extract text for ${mimeType}`, e);
      return '';
    }
  }

  private getPdfParser() {
    if (this.pdfParser || this.pdfParserFailed) {
      return this.pdfParser;
    }

    try {
      const require = createRequire(import.meta.url);
      this.pdfParser = require('pdf-parse');
    } catch (e) {
      this.pdfParserFailed = true;
      console.warn('ExtractionService: Failed to load pdf-parse', e);
    }

    return this.pdfParser;
  }

  private guessMimeType(filename: string): string {
    if (filename.endsWith('.pdf')) return 'application/pdf';
    if (filename.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (filename.endsWith('.txt')) return 'text/plain';
    if (filename.endsWith('.md')) return 'text/markdown';
    return 'application/octet-stream';
  }

  private async tryPdfOcr(buffer: Buffer): Promise<string> {
    const capability = this.getOcrCapability();
    if (!capability.available) {
      return '';
    }

    await this.acquireOcrSlot();
    const tmpBase = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aikb-ocr-'));
    const pdfPath = path.join(tmpBase, 'input.pdf');
    const imagePrefix = path.join(tmpBase, 'page');

    try {
      await fs.promises.writeFile(pdfPath, buffer);

      const convert = await this.runCommand(
        'pdftoppm',
        ['-f', '1', '-l', String(this.maxOcrPages), '-png', pdfPath, imagePrefix],
        30000
      );
      if (convert.code !== 0) {
        console.warn('ExtractionService: pdftoppm conversion failed', convert.stderr);
        return '';
      }

      const files = (await fs.promises.readdir(tmpBase))
        .filter((name) => name.startsWith('page-') && name.endsWith('.png'))
        .sort();
      if (files.length === 0) {
        return '';
      }

      const pageTexts: string[] = [];
      for (const file of files) {
        const imagePath = path.join(tmpBase, file);
        const ocr = await this.runCommand(
          'tesseract',
          [imagePath, 'stdout', '-l', 'eng', '--psm', '6'],
          30000
        );
        if (ocr.code === 0 && ocr.stdout) {
          pageTexts.push(ocr.stdout);
        }
      }

      return pageTexts.join('\n').trim();
    } catch (error) {
      console.warn('ExtractionService: OCR fallback failed', error);
      return '';
    } finally {
      this.releaseOcrSlot();
      await fs.promises.rm(tmpBase, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private isCommandAvailable(command: string): boolean {
    const locator = process.platform === 'win32' ? 'where' : 'which';
    return spawnSyncSafe(locator, [command], 5000);
  }

  private async runCommand(command: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL');
        }
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}`.trim() });
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ code, stdout, stderr });
      });
    });
  }

  private async acquireOcrSlot(): Promise<void> {
    if (this.activeOcrJobs < this.maxConcurrentOcrJobs) {
      this.activeOcrJobs++;
      return;
    }

    await new Promise<void>((resolve) => this.ocrQueue.push(resolve));
    this.activeOcrJobs++;
  }

  private releaseOcrSlot(): void {
    this.activeOcrJobs = Math.max(0, this.activeOcrJobs - 1);
    const next = this.ocrQueue.shift();
    if (next) {
      next();
    }
  }
}

function spawnSyncSafe(command: string, args: string[], timeoutMs: number): boolean {
  try {
    const child = spawnSync(command, args, { stdio: 'ignore', timeout: timeoutMs });
    return child.status === 0;
  } catch {
    return false;
  }
}
