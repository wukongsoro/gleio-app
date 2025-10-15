/**
 * AI Self-Correction Feedback Loop
 * Automatically sends detected errors back to AI for correction with retry limits
 */

import type { DetectedError } from '../error-detection/detector';

export interface CorrectionAttempt {
  attemptNumber: number;
  errors: DetectedError[];
  prompt: string;
  timestamp: number;
}

export interface CorrectionResult {
  success: boolean;
  attemptsMade: number;
  fixedErrors: DetectedError[];
  remainingErrors: DetectedError[];
  correctedCode?: string;
}

const MAX_CORRECTION_ATTEMPTS = 3;
const CORRECTION_HISTORY = new Map<string, CorrectionAttempt[]>();

/**
 * Build correction prompt for AI based on detected errors
 */
export function buildCorrectionPrompt(
  errors: DetectedError[],
  originalCode: string,
  filePath: string,
  attemptNumber: number
): string {
  const errorSummary = errors
    .map((err, idx) => {
      const location = err.file && err.line 
        ? `${err.file}:${err.line}${err.column ? `:${err.column}` : ''}`
        : 'Unknown location';
      
      const suggestion = err.suggestion ? `\n  💡 Suggestion: ${err.suggestion}` : '';
      
      return `${idx + 1}. [${err.type.toUpperCase()}] ${err.message}
  📍 Location: ${location}${suggestion}`;
    })
    .join('\n\n');

  return `🔧 **AUTO-CORRECTION REQUEST** (Attempt ${attemptNumber}/${MAX_CORRECTION_ATTEMPTS})

The following errors were detected in the generated code and need to be fixed:

${errorSummary}

**File:** ${filePath}

**Current Code:**
\`\`\`typescript
${originalCode}
\`\`\`

**Instructions:**
1. Analyze each error carefully and understand the root cause
2. Fix ALL errors listed above
3. Ensure the fixed code follows production quality standards:
   - Proper TypeScript typing (no 'any' types)
   - Comprehensive error handling
   - Null/undefined safety
   - Proper imports and dependencies
4. Return ONLY the corrected code without explanations
5. Ensure all imports are correct and packages exist
6. Test the logic mentally before responding

**Critical:** This is an automated correction attempt ${attemptNumber} of ${MAX_CORRECTION_ATTEMPTS}. 
The code MUST be correct this time. If you cannot fix it properly, explain why clearly.

Respond with the complete corrected code file.`;
}

/**
 * Check if we should attempt correction based on error history
 */
export function shouldAttemptCorrection(
  fileId: string,
  errors: DetectedError[]
): { should: boolean; reason?: string } {
  const history = CORRECTION_HISTORY.get(fileId) || [];
  
  if (history.length >= MAX_CORRECTION_ATTEMPTS) {
    return {
      should: false,
      reason: `Maximum correction attempts (${MAX_CORRECTION_ATTEMPTS}) reached for this file`,
    };
  }

  // Don't attempt correction if all errors are warnings
  const hasCriticalErrors = errors.some(err => err.severity === 'error');
  if (!hasCriticalErrors) {
    return {
      should: false,
      reason: 'Only warnings detected, no critical errors to fix',
    };
  }

  // Check if we're stuck in a loop (same errors repeating)
  if (history.length > 0) {
    const lastAttempt = history[history.length - 1];
    const sameErrors = errors.every(err => 
      lastAttempt.errors.some(lastErr => 
        lastErr.message === err.message && lastErr.type === err.type
      )
    );

    if (sameErrors && history.length >= 2) {
      return {
        should: false,
        reason: 'Stuck in correction loop - same errors persisting',
      };
    }
  }

  return { should: true };
}

/**
 * Record a correction attempt in history
 */
export function recordCorrectionAttempt(
  fileId: string,
  attempt: Omit<CorrectionAttempt, 'timestamp'>
): void {
  const history = CORRECTION_HISTORY.get(fileId) || [];
  history.push({
    ...attempt,
    timestamp: Date.now(),
  });
  CORRECTION_HISTORY.set(fileId, history);

  // Clean up old history (keep last 10 files only)
  if (CORRECTION_HISTORY.size > 10) {
    const oldestKey = Array.from(CORRECTION_HISTORY.keys())[0];
    if (oldestKey) {
      CORRECTION_HISTORY.delete(oldestKey);
    }
  }
}

/**
 * Get correction history for a file
 */
export function getCorrectionHistory(fileId: string): CorrectionAttempt[] {
  return CORRECTION_HISTORY.get(fileId) || [];
}

/**
 * Clear correction history for a file
 */
export function clearCorrectionHistory(fileId: string): void {
  CORRECTION_HISTORY.delete(fileId);
}

/**
 * Determine if errors were reduced between attempts
 */
export function wereErrorsReduced(
  previousErrors: DetectedError[],
  currentErrors: DetectedError[]
): boolean {
  const previousCritical = previousErrors.filter(e => e.severity === 'error').length;
  const currentCritical = currentErrors.filter(e => e.severity === 'error').length;
  
  return currentCritical < previousCritical;
}

/**
 * Generate user-friendly correction status message
 */
export function getCorrectionStatusMessage(
  result: CorrectionResult
): string {
  if (result.success) {
    return `✅ Auto-fix successful! ${result.fixedErrors.length} error(s) corrected in ${result.attemptsMade} attempt(s).`;
  }

  if (result.remainingErrors.length === 0) {
    return '✅ All errors resolved!';
  }

  const criticalCount = result.remainingErrors.filter(e => e.severity === 'error').length;
  
  if (result.attemptsMade >= MAX_CORRECTION_ATTEMPTS) {
    return `⚠️ Auto-fix partially successful. ${result.fixedErrors.length} fixed, ${criticalCount} critical error(s) remain after ${result.attemptsMade} attempts. Manual intervention needed.`;
  }

  return `⚠️ Auto-fix in progress... Attempt ${result.attemptsMade}/${MAX_CORRECTION_ATTEMPTS}`;
}

/**
 * Analyze error types and determine if they're auto-fixable
 */
export function areErrorsAutoFixable(errors: DetectedError[]): boolean {
  const autoFixableTypes: Array<DetectedError['type']> = [
    'typescript',
    'dependency',
  ];

  // All errors should be of auto-fixable types
  return errors.every(err => autoFixableTypes.includes(err.type));
}

/**
 * Prioritize errors for correction (fix critical errors first)
 */
export function prioritizeErrors(errors: DetectedError[]): DetectedError[] {
  return [...errors].sort((a, b) => {
    // Critical errors first
    if (a.severity === 'error' && b.severity !== 'error') return -1;
    if (a.severity !== 'error' && b.severity === 'error') return 1;

    // Then by type priority (typescript > runtime > build > dependency > eslint)
    const typePriority: Record<DetectedError['type'], number> = {
      typescript: 1,
      runtime: 2,
      build: 3,
      dependency: 4,
      eslint: 5,
    };

    return typePriority[a.type] - typePriority[b.type];
  });
}
