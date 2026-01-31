import { Logger } from '../utils/logger.js';

/**
 * P1.2: Hallucination Detection Service
 * 
 * Implements multi-layer validation to detect AI hallucinations:
 * 1. Quote Verification - Verify quotes actually exist in source context
 * 2. Contradiction Detection - Check for logical contradictions in answer
 * 3. Structure Validation - Ensure response matches expected format
 * 4. Confidence Calibration - Detect inflated confidence claims
 */

export interface HallucinationAnalysis {
  score: number; // 0-1, where 1 = completely hallucinated
  confidence: 'high' | 'medium' | 'low';
  issues: HallucinationIssue[];
  verdict: 'safe' | 'caution' | 'reject';
  details: {
    quoteVerificationScore: number;
    contradictionScore: number;
    structureScore: number;
    confidenceCalibrationScore: number;
  };
}

export interface HallucinationIssue {
  type: 'quote_unverified' | 'contradiction' | 'structural' | 'confidence_mismatch';
  severity: 'low' | 'medium' | 'high';
  description: string;
  evidence: string;
}

export class HallucinationService {
  /**
   * Main entry point: analyze response for hallucinations
   */
  async analyze(params: {
    query: string;
    answer: string;
    context: string[];
    citations?: Array<{ quote: string; source: string }>;
    aiConfidence?: string;
  }): Promise<HallucinationAnalysis> {
    const { query, answer, context, citations = [], aiConfidence } = params;

    const issues: HallucinationIssue[] = [];
    const details = {
      quoteVerificationScore: 1,
      contradictionScore: 0,
      structureScore: 1,
      confidenceCalibrationScore: 0
    };

    // 1. Quote Verification (Most Critical)
    const quoteIssues = this.verifyQuotes(citations, context);
    issues.push(...quoteIssues);
    details.quoteVerificationScore = this.calculateQuoteScore(quoteIssues, citations.length);

    // 2. Contradiction Detection
    const contradictionIssues = this.detectContradictions(answer, context);
    issues.push(...contradictionIssues);
    details.contradictionScore = this.calculateContradictionScore(contradictionIssues);

    // 3. Structure Validation
    const structureIssues = this.validateStructure(answer, citations.length);
    issues.push(...structureIssues);
    details.structureScore = this.calculateStructureScore(structureIssues);

    // 4. Confidence Calibration
    const confidenceIssues = this.checkConfidenceCalibration(aiConfidence, details);
    issues.push(...confidenceIssues);
    details.confidenceCalibrationScore = this.calculateConfidenceScore(confidenceIssues);

    // Calculate composite hallucination score
    const weights = { quote: 0.4, contradiction: 0.3, structure: 0.2, confidence: 0.1 };
    const score =
      (1 - details.quoteVerificationScore) * weights.quote +
      details.contradictionScore * weights.contradiction +
      (1 - details.structureScore) * weights.structure +
      details.confidenceCalibrationScore * weights.confidence;

    // Determine verdict
    let verdict: 'safe' | 'caution' | 'reject';
    if (score > 0.7) verdict = 'reject';
    else if (score > 0.4) verdict = 'caution';
    else verdict = 'safe';

    Logger.debug('HallucinationService: Analysis complete', {
      score: score.toFixed(2),
      verdict,
      issues: issues.length
    });

    return {
      score,
      confidence: this.getConfidenceLevel(score),
      issues,
      verdict,
      details
    };
  }

  /**
   * 1. Quote Verification: Check if quoted text appears in context
   */
  private verifyQuotes(citations: Array<{ quote: string; source: string }>, context: string[]): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];
    const contextNormalized = context.map(c => this.normalizeText(c));

    for (const citation of citations) {
      const quoteNorm = this.normalizeText(citation.quote);
      
      if (quoteNorm.length < 5) {
        issues.push({
          type: 'quote_unverified',
          severity: 'medium',
          description: 'Quote too short to verify',
          evidence: citation.quote.substring(0, 100)
        });
        continue;
      }

      // Check if quote appears (with fuzzy matching for robustness)
      const found = contextNormalized.some(ctx => this.fuzzyMatch(quoteNorm, ctx, 0.9));

      if (!found) {
        issues.push({
          type: 'quote_unverified',
          severity: 'high',
          description: 'Quote not found in source context (potential hallucination)',
          evidence: citation.quote.substring(0, 100)
        });
      }
    }

    return issues;
  }

  /**
   * 2. Contradiction Detection: Check for logical inconsistencies
   */
  private detectContradictions(answer: string, context: string[]): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];
    const answerNorm = this.normalizeText(answer);
    const contextNorm = context.map(c => this.normalizeText(c)).join(' ');

    // Check for direct contradictions (X is Y vs X is not Y)
    const contradictorPatterns = [
      { pattern: /\b(yes|true|is)\b/, opposite: /\b(no|false|is not|cannot)\b/ },
      { pattern: /\b(always)\b/, opposite: /\b(never|sometimes)\b/ },
      { pattern: /\b(agrees|supports)\b/, opposite: /\b(disagrees|opposes|contradicts)\b/ }
    ];

    for (const { pattern, opposite } of contradictorPatterns) {
      const answerHasPattern = pattern.test(answerNorm);
      const answerHasOpposite = opposite.test(answerNorm);
      const contextHasOpposite = opposite.test(contextNorm);

      if (answerHasPattern && answerHasOpposite && !contextHasOpposite) {
        issues.push({
          type: 'contradiction',
          severity: 'high',
          description: 'Answer contains self-contradictory statements',
          evidence: answer.substring(0, 100)
        });
      }
    }

    return issues;
  }

  /**
   * 3. Structure Validation: Check if response format is coherent
   */
  private validateStructure(answer: string, citationCount: number): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];

    // Check for common hallucination markers
    if (answer.includes('I don\'t have information') && citationCount > 0) {
      issues.push({
        type: 'structural',
        severity: 'high',
        description: 'Claims no information while providing citations (contradiction)',
        evidence: 'Answer contains conflicting statements'
      });
    }

    // Check if answer is suspiciously short with many citations
    if (answer.length < 50 && citationCount > 5) {
      issues.push({
        type: 'structural',
        severity: 'medium',
        description: 'Minimal answer with excessive citations (potential padding)',
        evidence: `${answer.length} chars, ${citationCount} citations`
      });
    }

    // Check if answer is suspiciously long (> 2000 chars) - often indicates hallucination
    if (answer.length > 2000) {
      issues.push({
        type: 'structural',
        severity: 'low',
        description: 'Unusually long answer - may contain tangential information',
        evidence: `${answer.length} chars`
      });
    }

    return issues;
  }

  /**
   * 4. Confidence Calibration: Check if confidence matches evidence
   */
  private checkConfidenceCalibration(aiConfidence: string | undefined, details: any): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];

    if (!aiConfidence) return issues;

    const confidenceLow = aiConfidence.toLowerCase() === 'low';
    const confidenceHigh = aiConfidence.toLowerCase() === 'high';
    const quoteScoreLow = details.quoteVerificationScore < 0.5;

    // High confidence but low verification = miscalibration
    if (confidenceHigh && quoteScoreLow) {
      issues.push({
        type: 'confidence_mismatch',
        severity: 'high',
        description: 'Claims high confidence but quotes not verified (confidence inflation)',
        evidence: `Claimed: ${aiConfidence}, Verified quotes: ${details.quoteVerificationScore}`
      });
    }

    // Low confidence but all quotes verified = unnecessarily cautious (okay)
    // High confidence and all verified = correct (good)
    // Low confidence and low verification = consistent (okay)

    return issues;
  }

  /**
   * Helper: Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Helper: Fuzzy match for robust quote verification
   */
  private fuzzyMatch(query: string, text: string, threshold: number = 0.9): boolean {
    if (text.includes(query)) return true;

    // Check if query is substring (allowing for some character differences)
    const queryWords = query.split(' ');
    const textWords = text.split(' ');

    let matches = 0;
    for (const qWord of queryWords) {
      for (const tWord of textWords) {
        if (this.stringSimilarity(qWord, tWord) > threshold) {
          matches++;
          break;
        }
      }
    }

    return matches / queryWords.length >= threshold;
  }

  /**
   * Helper: Calculate string similarity (0-1)
   */
  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Levenshtein distance
    const matrix: number[][] = Array(a.length + 1).fill(null).map(() => []);
    for (let i = 0; i <= a.length; i++) {
      (matrix[i] as number[]) = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      (matrix[0] as number[])[j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        const row = matrix[i] as number[];
        const prevRow = matrix[i - 1] as number[];
        row[j] = Math.min(
          (prevRow[j] as number) + 1,
          (row[j - 1] as number) + 1,
          (prevRow[j - 1] as number) + cost
        );
      }
    }

    const distance = (matrix[a.length] as number[])[b.length];
    return 1 - (distance as number) / Math.max(a.length, b.length);
  }

  /**
   * Score calculation helpers
   */
  private calculateQuoteScore(issues: HallucinationIssue[], totalQuotes: number): number {
    if (totalQuotes === 0) return 1;
    const unverifiedCount = issues.filter(i => i.type === 'quote_unverified').length;
    return 1 - unverifiedCount / totalQuotes;
  }

  private calculateContradictionScore(issues: HallucinationIssue[]): number {
    return Math.min(issues.filter(i => i.type === 'contradiction').length * 0.3, 1);
  }

  private calculateStructureScore(issues: HallucinationIssue[]): number {
    const highSeverity = issues.filter(i => i.type === 'structural' && i.severity === 'high').length;
    return 1 - Math.min(highSeverity * 0.5, 1);
  }

  private calculateConfidenceScore(issues: HallucinationIssue[]): number {
    const mismatchCount = issues.filter(i => i.type === 'confidence_mismatch').length;
    return Math.min(mismatchCount * 0.4, 1);
  }

  private getConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
    if (score > 0.7) return 'high';
    if (score > 0.4) return 'medium';
    return 'low';
  }
}
