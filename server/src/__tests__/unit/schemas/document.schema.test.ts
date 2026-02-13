import { describe, expect, it } from 'vitest';
import { uploadDocumentSchema } from '../../../schemas/document.schema.js';

describe('document.schema roles parsing', () => {
  it('accepts JSON-array role strings', () => {
    const result = uploadDocumentSchema.safeParse({
      category: 'IT',
      roles: '["viewer","editor"]'
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.roles : []).toEqual(['VIEWER', 'EDITOR']);
  });

  it('rejects unsupported role labels', () => {
    const result = uploadDocumentSchema.safeParse({
      category: 'IT',
      roles: '["viewer","intern"]'
    });

    expect(result.success).toBe(false);
  });
});
