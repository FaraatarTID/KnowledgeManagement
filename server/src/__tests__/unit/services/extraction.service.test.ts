import { describe, expect, it, vi } from 'vitest';
import { ExtractionService } from '../../../services/extraction.service.js';

describe('ExtractionService', () => {
  it('detects OCR tools when resolved binaries are executable', () => {
    const service = new ExtractionService();
    vi.spyOn(service as any, 'resolveFromPath').mockReturnValue(null);
    vi.spyOn(service as any, 'resolveFromEnv').mockImplementation((command: string) =>
      command === 'tesseract' ? 'C:\\tools\\tesseract.exe' : 'C:\\tools\\pdftoppm.exe'
    );
    vi.spyOn(service as any, 'canExecuteCommand').mockReturnValue(true);

    expect(service.getOcrCapability()).toEqual({
      available: true,
      pdftoppm: true,
      tesseract: true
    });
  });

  it('does not report OCR tools as available when resolved binaries are non-executable', () => {
    const service = new ExtractionService();
    vi.spyOn(service as any, 'resolveFromPath').mockReturnValue(null);
    vi.spyOn(service as any, 'resolveFromEnv').mockImplementation((command: string) =>
      command === 'tesseract' ? 'C:\\tools\\tesseract.exe' : 'C:\\tools\\pdftoppm.exe'
    );
    vi.spyOn(service as any, 'canExecuteCommand').mockReturnValue(false);

    expect(service.getOcrCapability()).toEqual({
      available: false,
      pdftoppm: false,
      tesseract: false
    });
  });
});
