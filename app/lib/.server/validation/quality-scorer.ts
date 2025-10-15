/**
 * Code Quality Scoring System
 * Calculates comprehensive quality scores for generated code
 */

import type { ValidationResult } from './static-analyzer';

export interface QualityScore {
  overall: number; // 0-100
  breakdown: {
    typeScript: number; // Type coverage score
    errorHandling: number; // Error handling completeness
    testing: number; // Test coverage
    accessibility: number; // A11y compliance
    security: number; // Security best practices
    performance: number; // Performance optimization
  };
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  suggestions: string[];
}

/**
 * Calculate TypeScript quality score
 */
function calculateTypeScriptScore(files: Record<string, string>): { score: number; issues: string[] } {
  let score = 100;
  const issues: string[] = [];
  let totalLines = 0;
  let typedLines = 0;
  let anyCount = 0;

  for (const [filename, content] of Object.entries(files)) {
    if (!filename.endsWith('.ts') && !filename.endsWith('.tsx')) continue;

    const lines = content.split('\n');
    totalLines += lines.length;

    for (const line of lines) {
      // Count explicit type annotations
      if (/:\s*\w+/.test(line) || /interface|type/.test(line)) {
        typedLines++;
      }

      // Penalize 'any' usage
      if (/:\s*any\b|<any>|as any/.test(line)) {
        anyCount++;
        score -= 2;
      }

      // Reward proper typing
      if (/:\s*(string|number|boolean|object|array|Promise|void|never|unknown)\b/.test(line)) {
        score += 0.5;
      }
    }
  }

  if (anyCount > 0) {
    issues.push(`Found ${anyCount} usage(s) of 'any' type - use specific types or 'unknown'`);
  }

  const typeCoverage = totalLines > 0 ? (typedLines / totalLines) * 100 : 0;
  if (typeCoverage < 50) {
    issues.push(`Low type coverage: ${typeCoverage.toFixed(1)}% - add more type annotations`);
    score -= 20;
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

/**
 * Calculate error handling score
 */
function calculateErrorHandlingScore(files: Record<string, string>): { score: number; issues: string[] } {
  let score = 100;
  const issues: string[] = [];
  let asyncFunctionCount = 0;
  let tryCatchCount = 0;
  let errorBoundaryCount = 0;

  for (const [filename, content] of Object.entries(files)) {
    const lines = content.split('\n');

    let inAsyncFunction = false;
    let hasTryCatch = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Count async functions
      if (/async\s+(function|\w+\s*\(|\(.*\)\s*=>)/.test(line)) {
        asyncFunctionCount++;
        inAsyncFunction = true;
        hasTryCatch = false;
      }

      // Count try-catch blocks
      if (line.trim().startsWith('try')) {
        tryCatchCount++;
        if (inAsyncFunction) hasTryCatch = true;
      }

      // Check for error boundaries in React
      if (/ErrorBoundary|componentDidCatch/.test(line)) {
        errorBoundaryCount++;
      }

      // Check if async function ends without try-catch
      if (inAsyncFunction && (line.trim() === '}' || i === lines.length - 1)) {
        const functionBlock = lines.slice(Math.max(0, i - 20), i + 1).join('\n');
        if (functionBlock.includes('await') && !hasTryCatch) {
          score -= 10;
          issues.push(`Async function without error handling in ${filename}:${i + 1}`);
        }
        inAsyncFunction = false;
      }
    }
  }

  if (asyncFunctionCount > 0 && tryCatchCount === 0) {
    issues.push('No try-catch blocks found - add error handling to async operations');
    score -= 30;
  }

  if (Object.keys(files).some(f => f.includes('component') || f.includes('tsx')) && errorBoundaryCount === 0) {
    issues.push('No React ErrorBoundary found - add error boundaries to catch component errors');
    score -= 10;
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

/**
 * Calculate testing score
 */
function calculateTestingScore(files: Record<string, string>): { score: number; issues: string[] } {
  const issues: string[] = [];
  
  const testFiles = Object.keys(files).filter(f => 
    f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__')
  );

  const sourceFiles = Object.keys(files).filter(f => 
    (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) &&
    !f.includes('.test.') && !f.includes('.spec.') && !f.includes('__tests__')
  );

  if (sourceFiles.length === 0) {
    return { score: 100, issues: [] }; // No source files to test
  }

  const testCoverage = (testFiles.length / sourceFiles.length) * 100;
  let score = testCoverage;

  if (testFiles.length === 0) {
    issues.push('No test files found - add unit tests for critical functions');
    score = 0;
  } else if (testCoverage < 50) {
    issues.push(`Low test coverage: ${testCoverage.toFixed(1)}% of files have tests`);
  } else if (testCoverage >= 80) {
    score = 100; // Bonus for excellent coverage
  }

  // Check for testing best practices in test files
  for (const [filename, content] of Object.entries(files)) {
    if (!testFiles.includes(filename)) continue;

    if (!content.includes('describe') && !content.includes('it') && !content.includes('test')) {
      issues.push(`${filename} doesn't use standard test structure (describe/it/test)`);
      score -= 5;
    }

    if (!content.includes('expect') && !content.includes('assert')) {
      issues.push(`${filename} has no assertions - tests must verify behavior`);
      score -= 10;
    }
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

/**
 * Calculate accessibility score
 */
function calculateAccessibilityScore(files: Record<string, string>): { score: number; issues: string[] } {
  let score = 100;
  const issues: string[] = [];

  for (const [filename, content] of Object.entries(files)) {
    if (!filename.endsWith('.tsx') && !filename.endsWith('.jsx')) continue;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for images without alt text
      if (/<img[^>]*>/.test(line) && !line.includes('alt=')) {
        issues.push(`${filename}:${i + 1} - Image without alt attribute`);
        score -= 5;
      }

      // Check for buttons without accessible labels
      if (/<button[^>]*>/.test(line) && !line.includes('aria-label') && !/>[\w\s]+<\/button>/.test(line)) {
        issues.push(`${filename}:${i + 1} - Button without accessible label`);
        score -= 3;
      }

      // Check for input without label
      if (/<input[^>]*>/.test(line) && !line.includes('aria-label') && !line.includes('id=')) {
        issues.push(`${filename}:${i + 1} - Input without label or aria-label`);
        score -= 3;
      }

      // Reward semantic HTML usage
      if (/<(header|nav|main|article|aside|footer|section)[^>]*>/.test(line)) {
        score += 1;
      }

      // Reward ARIA attributes
      if (/aria-(label|describedby|labelledby|role)/.test(line)) {
        score += 0.5;
      }

      // Check for onClick on div (should use button)
      if (/<div[^>]*onClick/.test(line)) {
        issues.push(`${filename}:${i + 1} - onClick on div - use button for interactive elements`);
        score -= 5;
      }
    }
  }

  if (issues.length === 0) {
    issues.push('Good accessibility practices detected');
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

/**
 * Calculate security score
 */
function calculateSecurityScore(files: Record<string, string>): { score: number; issues: string[] } {
  let score = 100;
  const issues: string[] = [];

  for (const [filename, content] of Object.entries(files)) {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for hardcoded secrets
      if (/(api[_-]?key|secret|password|token)\s*=\s*['"][^'"]+['"]/i.test(line) && !line.includes('process.env')) {
        issues.push(`${filename}:${i + 1} - Potential hardcoded secret`);
        score -= 20;
      }

      // Check for eval usage
      if (/\beval\(/.test(line)) {
        issues.push(`${filename}:${i + 1} - eval() usage detected - security risk`);
        score -= 30;
      }

      // Check for dangerouslySetInnerHTML
      if (/dangerouslySetInnerHTML/.test(line) && !line.includes('sanitize') && !line.includes('DOMPurify')) {
        issues.push(`${filename}:${i + 1} - dangerouslySetInnerHTML without sanitization`);
        score -= 25;
      }

      // Check for SQL concatenation
      if (/query.*\+.*SELECT|INSERT.*\+/i.test(line)) {
        issues.push(`${filename}:${i + 1} - Potential SQL injection risk`);
        score -= 30;
      }

      // Reward security best practices
      if (/process\.env\.\w+/.test(line)) {
        score += 1; // Using environment variables
      }

      if (/sanitize|escape|validate/.test(line)) {
        score += 2; // Input validation/sanitization
      }
    }
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

/**
 * Calculate performance score
 */
function calculatePerformanceScore(files: Record<string, string>): { score: number; issues: string[] } {
  let score = 100;
  const issues: string[] = [];

  for (const [filename, content] of Object.entries(files)) {
    const lines = content.split('\n');

    for (const line of lines) {
      // Reward lazy loading and code splitting
      if (/React\.lazy|dynamic\(|import\(/.test(line)) {
        score += 2;
      }

      // Reward memoization
      if (/React\.memo|useMemo|useCallback/.test(line)) {
        score += 1;
      }

      // Reward lazy image loading
      if (/<img[^>]*loading=["']lazy["']/.test(line)) {
        score += 1;
      }

      // Penalize large inline data
      if (line.length > 500) {
        issues.push(`${filename} - Very long line detected - consider extracting to separate file`);
        score -= 2;
      }

      // Check for unnecessary re-renders
      if (/useEffect\(\).*\[\]/.test(line) && /setState|set\w+/.test(line)) {
        issues.push(`${filename} - useEffect with empty deps calling setState - potential infinite loop`);
        score -= 10;
      }
    }
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

/**
 * Calculate overall quality score
 */
export function calculateQualityScore(
  files: Record<string, string>,
  validationResult?: ValidationResult
): QualityScore {
  const tsResult = calculateTypeScriptScore(files);
  const errorResult = calculateErrorHandlingScore(files);
  const testResult = calculateTestingScore(files);
  const a11yResult = calculateAccessibilityScore(files);
  const securityResult = calculateSecurityScore(files);
  const perfResult = calculatePerformanceScore(files);

  // Apply validation penalty if provided
  let validationPenalty = 0;
  if (validationResult) {
    validationPenalty = validationResult.errorCount * 5 + validationResult.warningCount * 2;
  }

  const breakdown = {
    typeScript: tsResult.score,
    errorHandling: errorResult.score,
    testing: testResult.score,
    accessibility: a11yResult.score,
    security: securityResult.score,
    performance: perfResult.score,
  };

  // Calculate weighted average
  const overall = Math.max(0, Math.min(100, 
    (tsResult.score * 0.25 +
     errorResult.score * 0.20 +
     testResult.score * 0.15 +
     a11yResult.score * 0.15 +
     securityResult.score * 0.15 +
     perfResult.score * 0.10) - validationPenalty
  ));

  // Determine grade
  let grade: QualityScore['grade'];
  if (overall >= 95) grade = 'A+';
  else if (overall >= 85) grade = 'A';
  else if (overall >= 75) grade = 'B';
  else if (overall >= 65) grade = 'C';
  else if (overall >= 50) grade = 'D';
  else grade = 'F';

  // Collect all suggestions
  const suggestions = [
    ...tsResult.issues,
    ...errorResult.issues,
    ...testResult.issues,
    ...a11yResult.issues,
    ...securityResult.issues,
    ...perfResult.issues,
  ];

  return {
    overall: Math.round(overall),
    breakdown,
    grade,
    suggestions: suggestions.slice(0, 10), // Top 10 suggestions
  };
}

/**
 * Generate quality report
 */
export function generateQualityReport(score: QualityScore): string {
  const lines: string[] = [];

  lines.push(`\n📊 CODE QUALITY REPORT`);
  lines.push(`${'='.repeat(50)}`);
  lines.push(`Overall Score: ${score.overall}/100 (Grade: ${score.grade})`);
  lines.push('');

  lines.push('📈 Breakdown:');
  lines.push(`  TypeScript Quality:  ${score.breakdown.typeScript.toFixed(0)}/100`);
  lines.push(`  Error Handling:      ${score.breakdown.errorHandling.toFixed(0)}/100`);
  lines.push(`  Testing Coverage:    ${score.breakdown.testing.toFixed(0)}/100`);
  lines.push(`  Accessibility:       ${score.breakdown.accessibility.toFixed(0)}/100`);
  lines.push(`  Security:            ${score.breakdown.security.toFixed(0)}/100`);
  lines.push(`  Performance:         ${score.breakdown.performance.toFixed(0)}/100`);
  lines.push('');

  if (score.suggestions.length > 0) {
    lines.push('💡 Top Suggestions for Improvement:');
    score.suggestions.slice(0, 5).forEach((suggestion, idx) => {
      lines.push(`  ${idx + 1}. ${suggestion}`);
    });
  }

  lines.push('');

  return lines.join('\n');
}
