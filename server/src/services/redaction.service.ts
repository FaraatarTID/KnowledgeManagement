export class RedactionService {
  /**
   * Redacts sensitive fields from content based on provided rules.
   */
  redact(content: string, rules: { redactFields?: string[] }): string {
    if (!rules.redactFields || rules.redactFields.length === 0) {
      return content;
    }

    let redactedContent = content;
    for (const field of rules.redactFields) {
      // Basic regex replacement for configured key-value patterns
      // Matches "field: value" or "field=value"
      const regex = new RegExp(`${field}\\s*[:=]\\s*[^\\n,]+`, 'gi');
      redactedContent = redactedContent.replace(regex, `${field}: [REDACTED]`);
    }

    return redactedContent;
  }

  /**
   * Basic PII detection and redaction.
   */
  redactPII(content: string): string {
    // Robust email detection (handles common obfuscations like [at] or (dot))
    let redacted = content.replace(/[a-zA-Z0-9._%+-]+(?:\s*(?:@|\[at\]|\(at\))\s*)[a-zA-Z0-9.-]+(?:\s*(?:\.|\[dot\]|\(dot\))\s*)[a-zA-Z]{2,}/gi, '[EMAIL REDACTED]');
    
    // Robust phone detection (supports various formats including international)
    // SECURITY FIX: ReDoS-resistant regex for phone numbers
    redacted = redacted.replace(/(?:\+?\d{1,3})?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[PHONE REDACTED]');
    
    // SECURITY: SSN patterns (US format: XXX-XX-XXXX, with or without dashes)
    redacted = redacted.replace(/\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g, '[SSN REDACTED]');
    
    // SECURITY: National IDs (EU, UK passport-style formats)
    redacted = redacted.replace(/\b[A-Z]{1,2}\d{6,9}\b/gi, '[ID REDACTED]');
    
    return redacted;
  }
}
