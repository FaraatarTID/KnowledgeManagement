export declare class RedactionService {
    /**
     * Redacts sensitive fields from content based on provided rules.
     */
    redact(content: string, rules: {
        redactFields?: string[];
    }): string;
    /**
     * Basic PII detection and redaction.
     */
    redactPII(content: string): string;
}
//# sourceMappingURL=redaction.service.d.ts.map