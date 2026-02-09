import { createRequire } from 'module';
import mammoth from 'mammoth';
import fs from 'fs';

export class ExtractionService {
  private pdfParser: ((buffer: Buffer) => Promise<{ text: string }>) | null = null;
  private pdfParserFailed = false;

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
        return data.text;
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
}
