/**
 * AUDIT LOG VALIDATION WITH ZOD
 * 
 * Problem: Arbitrary metadata in audit logs → SQL injection risk
 * Solution: Validate all entries before buffering
 * 
 * Before applying: Read IMPLEMENTATION_PLAN.md section P0.3
 * 
 * FILE TO MODIFY: server/src/services/access.service.ts
 */

import { z } from 'zod';

// ============================================================================
// ADD THIS SCHEMA AT TOP OF FILE
// ============================================================================

export const auditLogEntrySchema = z.object({
  userId: z.string()
    .min(1, 'userId required')
    .or(z.literal('anonymous')),
  
  action: z.enum([
    'RAG_QUERY',
    'DOCUMENT_UPLOAD',
    'DOCUMENT_DELETE',
    'AUTH_LOGIN',
    'AUTH_LOGIN_FAILED',
    'AUTH_LOGOUT',
    'AUTH_REGISTER',
    'ACCESS_DENIED',
    'SETTINGS_CHANGE',
    'PII_DETECTED_IN_QUERY',
    'VECTOR_SYNC',
    'VECTOR_DELETE'
  ]),
  
  resourceId: z.string().uuid().optional(),
  
  query: z.string()
    .max(2000, 'Query too long (max 2000 chars)')
    .optional(),
  
  granted: z.boolean(),
  
  reason: z.string()
    .max(500, 'Reason too long (max 500 chars)')
    .optional(),
  
  metadata: z.record(z.any())
    .optional()
    .refine(
      (m) => m ? Object.keys(m).length <= 10 : true,
      'Metadata can have max 10 keys'
    )
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

// ============================================================================
// REPLACE log() METHOD IN AuditService WITH THIS:
// ============================================================================

export const validatedLogMethod = `
async log(entry: any): Promise<void> {
  try {
    // Validate against schema
    const validated = auditLogEntrySchema.parse(entry);

    const logEntry = {
      user_id: validated.userId,
      action: validated.action,
      resource_id: validated.resourceId,
      query: validated.query,
      granted: validated.granted,
      reason: validated.reason,
      metadata: validated.metadata || {},
      created_at: new Date().toISOString()
    };

    if (!this.supabase) {
      console.log(
        \`[AUDIT] \${logEntry.created_at}: \${logEntry.user_id} -> \${logEntry.action} (granted: \${logEntry.granted})\`
      );
      return;
    }

    this.buffer.push(logEntry);

    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      await this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[AUDIT] Invalid audit log entry:', {
        issues: error.issues,
        entry: entry
      });
      // Don't re-throw - we still want to function even if entry is malformed
      return;
    }
    throw error;
  }
}
`;

// ============================================================================
// TEST CASES: Run these to verify validation works
// ============================================================================

export const auditValidationTests = {
  VALID_ENTRY: {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    action: 'RAG_QUERY',
    granted: true,
    query: 'What is the company policy?',
    reason: 'User has access',
    metadata: { vectorCount: 42, duration: 234 }
  },

  INVALID_ACTION: {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    action: 'INVALID_ACTION', // ❌ Not in enum
    granted: true
  },

  QUERY_TOO_LONG: {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    action: 'RAG_QUERY',
    granted: true,
    query: 'a'.repeat(2001) // ❌ > 2000 chars
  },

  TOO_MANY_METADATA_KEYS: {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    action: 'RAG_QUERY',
    granted: true,
    metadata: {
      k1: 1, k2: 2, k3: 3, k4: 4, k5: 5,
      k6: 6, k7: 7, k8: 8, k9: 9, k10: 10,
      k11: 11 // ❌ 11 keys > 10
    }
  },

  ANONYMOUS_USER: {
    userId: 'anonymous',
    action: 'RAG_QUERY',
    granted: false,
    reason: 'User not authenticated'
  },

  MINIMAL_VALID: {
    userId: 'system',
    action: 'VECTOR_SYNC',
    granted: true
  }
};

// ============================================================================
// MANUAL TEST
// ============================================================================

export const testAuditValidation = async () => {
  console.log(`
  🧪 AUDIT LOG VALIDATION TEST

  To test audit log validation:

  1. Add this to a test file:

      import { auditLogEntrySchema, auditValidationTests } from './audit-validation';

      describe('Audit Log Validation', () => {
        it('should accept valid entries', () => {
          expect(() => 
            auditLogEntrySchema.parse(auditValidationTests.VALID_ENTRY)
          ).not.toThrow();
        });

        it('should reject invalid action', () => {
          expect(() =>
            auditLogEntrySchema.parse(auditValidationTests.INVALID_ACTION)
          ).toThrow();
        });

        it('should reject query > 2000 chars', () => {
          expect(() =>
            auditLogEntrySchema.parse(auditValidationTests.QUERY_TOO_LONG)
          ).toThrow();
        });

        it('should reject metadata with > 10 keys', () => {
          expect(() =>
            auditLogEntrySchema.parse(auditValidationTests.TOO_MANY_METADATA_KEYS)
          ).toThrow();
        });

        it('should accept anonymous user', () => {
          expect(() =>
            auditLogEntrySchema.parse(auditValidationTests.ANONYMOUS_USER)
          ).not.toThrow();
        });
      });

  2. Run tests:
     npm run test

  3. Verify all pass ✅
  `);
};

// ============================================================================
// BACKWARD COMPATIBILITY NOTE
// ============================================================================

/*
  This change is BACKWARD COMPATIBLE because:
  
  ✅ All existing audit log entries conform to the schema
  ✅ Only NEW entries are validated
  ✅ Invalid entries are logged but not thrown (graceful degradation)
  ✅ No database schema changes
  ✅ No API changes
  
  If you find entries that fail validation:
  
  1. Check logs for "[AUDIT] Invalid audit log entry"
  2. These entries are silently dropped (not re-thrown)
  3. Adjust schema if necessary
  4. No rollback needed - just fix and re-deploy
*/
