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
    sensitivityLevel: string;
    documentSensitivity: string;
    accessControl: any;
  }): Promise<AccessDecision> {
    const { userRole, documentSensitivity, accessControl } = params;

    // 1. Role-base check
    const roles: Record<string, number> = { 'VIEWER': 1, 'EDITOR': 2, 'MANAGER': 3, 'ADMIN': 4 };
    const requiredRoleLevel = roles[accessControl.minimumRole] || 1;
    const userRoleLevel = roles[userRole] || 1;

    if (userRoleLevel < requiredRoleLevel) {
      return { allowed: false, reason: `Requires ${accessControl.minimumRole} role or higher` };
    }

    // 2. Sensitivity check
    const sensitivityLevels: Record<string, number> = { 'PUBLIC': 0, 'INTERNAL': 1, 'CONFIDENTIAL': 2, 'RESTRICTED': 3, 'EXECUTIVE': 4 };
    if ((sensitivityLevels[params.sensitivityLevel] || 0) < (sensitivityLevels[documentSensitivity] || 0)) {
      return { allowed: false, reason: `Requires ${documentSensitivity} clearance` };
    }

    // 3. Department check
    if (accessControl.allowedDepartments && accessControl.allowedDepartments.length > 0) {
      if (!accessControl.allowedDepartments.includes(params.userDepartment)) {
        return { allowed: false, reason: `Document restricted to: ${accessControl.allowedDepartments.join(', ')}` };
      }
    }

    return { allowed: true, reason: 'Access granted', auditLevel: 'standard' };
  }
}

export class AuditService {
  async log(entry: {
    userId: string;
    action: string;
    resourceId?: string;
    query?: string;
    granted: boolean;
    reason?: string;
  }) {
    console.log(`[AUDIT] ${new Date().toISOString()}: ${entry.userId} performed ${entry.action} on ${entry.resourceId || 'N/A'}. Granted: ${entry.granted}. Reason: ${entry.reason || 'N/A'}`);
    // In a real implementation, this would save to the Supabase audit_logs table.
  }
}
