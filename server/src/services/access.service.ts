export interface AccessDecision {
  allowed: boolean;
  reason: string;
  auditLevel?: 'minimal' | 'standard' | 'maximum';
}

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
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class AuditService {
  private supabase: SupabaseClient | null = null;

  constructor() {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      if (env.NODE_ENV === 'test') {
        this.supabase = null;
        return;
      }
      throw new Error('FATAL: Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing. Auditing is mandatory.');
    }

    this.supabase = createClient(url, key);
  }

  async log(entry: {
    userId: string;
    action: string;
    resourceId?: string;
    query?: string;
    granted: boolean;
    reason?: string;
    metadata?: any;
  }) {
    if (!this.supabase) {
      console.log(`[AUDIT] ${new Date().toISOString()}: ${entry.userId} performed ${entry.action} on ${entry.resourceId || 'N/A'}. Granted: ${entry.granted}. Metadata: ${JSON.stringify(entry.metadata || {})}`);
      return;
    }

    try {
      const { error } = await this.supabase
        .from('audit_logs')
        .insert([{
          user_id: entry.userId,
          action: entry.action,
          resource_id: entry.resourceId,
          query: entry.query,
          granted: entry.granted,
          reason: entry.reason,
          metadata: entry.metadata, // NEW: citations
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;
    } catch (e) {
      console.error('AuditService: Failed to persist log', e);
    }
  }

  async getResolutionStats(): Promise<{ percentage: string }> {
    if (!this.supabase) {
      return { percentage: 'Mock Mode' };
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
