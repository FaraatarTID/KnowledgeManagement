export interface AccessDecision {
    allowed: boolean;
    reason: string;
    auditLevel?: 'minimal' | 'standard' | 'maximum';
}
export declare class AccessControlEngine {
    checkAccess(params: {
        userId: string;
        documentId: string;
        userRole: string;
        userDepartment: string;
        documentSensitivity: string;
        documentDepartment?: string;
    }): Promise<AccessDecision>;
}
export declare class AuditService {
    private supabase;
    private isDemoMode;
    constructor();
    log(entry: {
        userId: string;
        action: string;
        resourceId?: string;
        query?: string;
        granted: boolean;
        reason?: string;
    }): Promise<void>;
    getResolutionStats(): Promise<{
        percentage: string;
    }>;
}
//# sourceMappingURL=access.service.d.ts.map