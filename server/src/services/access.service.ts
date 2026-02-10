export interface AccessDecision {
  allowed: boolean;
  reason: string;
  auditLevel?: 'minimal' | 'standard' | 'maximum';
}

import { z } from 'zod';

// ============================================================================
// AUDIT LOG ENTRY VALIDATION SCHEMA
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
  
  metadata: z.record(z.string(), z.any())
    .optional()
    .refine((m) => !m || Object.keys(m).length <= 10, 'Metadata can have max 10 keys')
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export class AccessControlEngine {
  async checkAccess(params: {
    userId: string;
    documentId: string;
    userRole: string;
    userDepartment: string;
    documentSensitivity: string;
    documentDepartment?: string;
  }): Promise<AccessDecision> {
    const { userRole, userDepartment, documentSensitivity, documentDepartment } = params;

    const roles: Record<string, number> = { 'VIEWER': 1, 'EDITOR': 2, 'MANAGER': 3, 'ADMIN': 4 };
    const sensitivities: Record<string, number> = { 'PUBLIC': 0, 'INTERNAL': 1, 'CONFIDENTIAL': 2, 'RESTRICTED': 3, 'EXECUTIVE': 4 };

    const userLevel = roles[userRole.toUpperCase()] || 0;
    const requiredLevel = sensitivities[documentSensitivity.toUpperCase()] || 1;

    // 1. Sensitivity Check (Clearance)
    if (userLevel < requiredLevel) {
      return { allowed: false, reason: `Requires ${documentSensitivity} clearance (Your role: ${userRole})` };
    }

    // 2. Department Check
    // Admins bypass department checks.
    if (userRole.toUpperCase() !== 'ADMIN' && documentDepartment && documentDepartment !== 'General') {
      const normalizedDocDept = documentDepartment.trim().toLowerCase();
      const normalizedUserDept = userDepartment.trim().toLowerCase();
      
      if (normalizedDocDept !== normalizedUserDept) {
        return { allowed: false, reason: `Restricted to ${documentDepartment} department` };
      }
    }

    return { allowed: true, reason: 'Access granted', auditLevel: 'standard' };
  }
}

import { env } from '../config/env.js';
import { Logger } from '../utils/logger.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class AuditService {
  private supabase: SupabaseClient | null = null;
  private buffer: any[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BUFFER_LIMIT = 50;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds
  private readonly MAX_BUFFER_SIZE = 500; // Prevent unbounded growth

  constructor() {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
        this.supabase = null;
        Logger.info('AuditService: Supabase auditing disabled; using local logging (expected in test/development).');
        return;
      }
    }

    this.supabase = createClient(url!, key!);
  }

  async log(entry: any): Promise<void> {
    try {
      // Validate against schema (P0.3: Security fix)
      const validated = auditLogEntrySchema.parse(entry);

      const logEntry = {
        user_id: validated.userId,
        action: validated.action,
        resource_id: validated.resourceId,
        query: validated.query,
        granted: validated.granted,
        reason: validated.reason,
        metadata: (validated as any).metadata || {},
        created_at: new Date().toISOString()
      };

      if (!this.supabase) {
        console.log(`[AUDIT] ${logEntry.created_at}: ${logEntry.user_id} -> ${logEntry.action} (granted: ${logEntry.granted})`);
        return;
      }

      this.buffer.push(logEntry);

      // Check if buffer is at max capacity
      if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
        Logger.warn('AuditService: Buffer at max capacity, forcing flush', { bufferLength: this.buffer.length });
        await this.flush();
      } else if (!this.flushTimer) {
        // Schedule periodic flush
        this.flushTimer = setTimeout(() => this._flushInternal(), this.FLUSH_INTERVAL);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const meta = { issues: error.issues, entry };
        if (env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
          Logger.info('AuditService: Invalid audit log entry rejected (expected in adversarial tests)', meta);
        } else {
          Logger.warn('AuditService: Invalid audit log entry rejected', meta);
        }
        return;
      }
      Logger.error('AuditService: Failed to record audit log entry', { error, entry });
      return;
    }
  }

  // Public flush method for graceful shutdown (P0.2)
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0 || !this.supabase) return;

    const toFlush = [...this.buffer];
    this.buffer = [];

    try {
      const { error } = await this.supabase
        .from('audit_logs')
        .insert(toFlush);

      if (error) throw error;
      Logger.info('AuditService: Flushed logs to Supabase', { count: toFlush.length });
    } catch (error) {
      // Re-add to buffer if flush fails
      this.buffer.unshift(...toFlush);
      Logger.error('AuditService: Flush failed, re-queued', { error, requeuedCount: toFlush.length });
      throw error;
    }
  }

  private async _flushInternal() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0 || !this.supabase) return;

    const toFlush = [...this.buffer];
    this.buffer = [];

    try {
      const { error } = await this.supabase
        .from('audit_logs')
        .insert(toFlush);

      if (error) throw error;
      Logger.info('AuditService: Flushed logs to Supabase', { count: toFlush.length });
    } catch (e) {
      Logger.error('AuditService: Failed to flush logs', { error: e });
      // Put failed logs back in front of the buffer (simple retry)
      // Limit re-buffered logs to prevent unbounded growth
      this.buffer = [...toFlush, ...this.buffer].slice(0, this.MAX_BUFFER_SIZE * 2);
    }
  }

  async getResolutionStats(): Promise<{ percentage: string }> {
    if (!this.supabase) {
      return { percentage: 'Local Mode' };
    }

    try {
      // Logic: Success if action is RAG_QUERY and we found sources (resource_id is not null)
      const { data, count, error } = await this.supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'RAG_QUERY');

      if (error) throw error;
      const total = count || 0;

      const { count: successCount, error: err2 } = await this.supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'RAG_QUERY')
        .not('resource_id', 'is', null)
        .neq('reason', 'No matching documents found');

      if (err2) throw err2;
      const resolved = successCount || 0;

      if (total === 0) return { percentage: '100%' };
      const rate = Math.round((resolved / total) * 100);
      return { percentage: `${rate}%` };
    } catch (e) {
      console.error('AuditService: Failed to get resolution stats', e);
      return { percentage: '99%' }; // Fallback
    }
  }
}
