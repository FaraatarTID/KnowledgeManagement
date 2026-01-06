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
        sensitivityLevel: string;
        documentSensitivity: string;
        accessControl: any;
    }): Promise<AccessDecision>;
}
export declare class AuditService {
    log(entry: {
        userId: string;
        action: string;
        resourceId?: string;
        query?: string;
        granted: boolean;
        reason?: string;
    }): Promise<void>;
}
//# sourceMappingURL=access.service.d.ts.map