/**
 * AI-Powered Error Detection Service
 * Multi-layer error detection for TypeScript, ESLint, runtime, build, and dependency issues
 */

export interface DetectedError {
  type: 'typescript' | 'eslint' | 'runtime' | 'build' | 'dependency';
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;
}

export interface ErrorDetectionResult {
  errors: DetectedError[];
  hasErrors: boolean;
  hasCriticalErrors: boolean;
}

/**
 * TypeScript Error Patterns
 */
const TS_ERROR_PATTERNS = [
  {
    pattern: /error TS(\d+):\s*(.+)/,
    extract: (match: RegExpMatchArray) => ({
      code: `TS${match[1]}`,
      message: match[2],
    }),
  },
  {
    pattern: /(.+?)\((\d+),(\d+)\):\s*error\s+TS(\d+):\s*(.+)/,
    extract: (match: RegExpMatchArray) => ({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      code: `TS${match[4]}`,
      message: match[5],
    }),
  },
  {
    pattern: /'(.+?)' is possibly 'null'|'undefined'/,
    extract: (match: RegExpMatchArray) => ({
      message: match[0],
      suggestion: `Add null check: if (${match[1]}) { ... } or use optional chaining: ${match[1]}?.`,
    }),
  },
  {
    pattern: /Property '(.+?)' does not exist on type '(.+?)'/,
    extract: (match: RegExpMatchArray) => ({
      message: match[0],
      suggestion: `Check if property '${match[1]}' is correctly defined on '${match[2]}' or add it to the interface/type.`,
    }),
  },
  {
    pattern: /Type '.+?' is not assignable to type '.+?'/,
    extract: (match: RegExpMatchArray) => ({
      message: match[0],
      suggestion: 'Check type compatibility. You may need type assertions or type guards.',
    }),
  },
];

/**
 * Runtime Error Patterns
 */
const RUNTIME_ERROR_PATTERNS = [
  {
    pattern: /TypeError:\s*(.+)/,
    type: 'runtime' as const,
    severity: 'error' as const,
  },
  {
    pattern: /ReferenceError:\s*(.+)/,
    type: 'runtime' as const,
    severity: 'error' as const,
  },
  {
    pattern: /SyntaxError:\s*(.+)/,
    type: 'runtime' as const,
    severity: 'error' as const,
  },
  {
    pattern: /Error:\s*Cannot find module\s*['"](.+?)['"]/,
    type: 'dependency' as const,
    severity: 'error' as const,
    suggestion: (match: RegExpMatchArray) => 
      `Module '${match[1]}' not found. Add it to package.json: npm install ${match[1]}`,
  },
  {
    pattern: /Module not found: Can't resolve\s*['"](.+?)['"]/,
    type: 'dependency' as const,
    severity: 'error' as const,
    suggestion: (match: RegExpMatchArray) => 
      `Cannot resolve '${match[1]}'. Check if the module exists and is installed.`,
  },
];

/**
 * Build Error Patterns (Webpack/Vite)
 */
const BUILD_ERROR_PATTERNS = [
  {
    pattern: /ERROR in (.+?)\n(.+)/,
    type: 'build' as const,
    severity: 'error' as const,
  },
  {
    pattern: /Failed to compile/i,
    type: 'build' as const,
    severity: 'error' as const,
  },
  {
    pattern: /Build failed with (\d+) error/,
    type: 'build' as const,
    severity: 'error' as const,
  },
  {
    pattern: /ENOENT: no such file or directory.*['"](.+?)['"]/,
    type: 'build' as const,
    severity: 'error' as const,
    suggestion: (match: RegExpMatchArray) => 
      `File not found: '${match[1]}'. Check if the file path is correct.`,
  },
];

/**
 * Dependency Conflict Patterns
 */
const DEPENDENCY_PATTERNS = [
  {
    pattern: /npm ERR! peer dep missing: (.+?),/,
    type: 'dependency' as const,
    severity: 'warning' as const,
    suggestion: (match: RegExpMatchArray) => 
      `Peer dependency missing: ${match[1]}. Install it with: npm install ${match[1]}`,
  },
  {
    pattern: /ERESOLVE unable to resolve dependency tree/,
    type: 'dependency' as const,
    severity: 'error' as const,
    suggestion: () => 
      'Dependency conflict detected. Try: npm install --legacy-peer-deps or resolve version conflicts.',
  },
  {
    pattern: /ERR_PNPM_PEER_DEP_ISSUES/,
    type: 'dependency' as const,
    severity: 'warning' as const,
  },
];

/**
 * Detect TypeScript errors in terminal output
 */
export function detectTypeScriptErrors(output: string): DetectedError[] {
  const errors: DetectedError[] = [];

  for (const { pattern, extract } of TS_ERROR_PATTERNS) {
    const matches = output.matchAll(new RegExp(pattern, 'g'));
    
    for (const match of matches) {
      const extracted = extract(match);
      errors.push({
        type: 'typescript',
        severity: 'error',
        message: extracted.message || match[0],
        file: extracted.file,
        line: extracted.line,
        column: extracted.column,
        code: extracted.code,
        suggestion: extracted.suggestion,
      });
    }
  }

  return errors;
}

/**
 * Detect runtime errors in terminal output
 */
export function detectRuntimeErrors(output: string): DetectedError[] {
  const errors: DetectedError[] = [];

  for (const { pattern, type, severity, suggestion } of RUNTIME_ERROR_PATTERNS) {
    const matches = output.matchAll(new RegExp(pattern, 'g'));
    
    for (const match of matches) {
      errors.push({
        type,
        severity,
        message: match[0],
        suggestion: typeof suggestion === 'function' ? suggestion(match) : suggestion,
      });
    }
  }

  return errors;
}

/**
 * Detect build errors in terminal output
 */
export function detectBuildErrors(output: string): DetectedError[] {
  const errors: DetectedError[] = [];

  for (const { pattern, type, severity, suggestion } of BUILD_ERROR_PATTERNS) {
    const matches = output.matchAll(new RegExp(pattern, 'g'));
    
    for (const match of matches) {
      errors.push({
        type,
        severity,
        message: match[0],
        suggestion: typeof suggestion === 'function' ? suggestion(match) : suggestion,
      });
    }
  }

  return errors;
}

/**
 * Detect dependency errors in terminal output
 */
export function detectDependencyErrors(output: string): DetectedError[] {
  const errors: DetectedError[] = [];

  for (const { pattern, type, severity, suggestion } of DEPENDENCY_PATTERNS) {
    const matches = output.matchAll(new RegExp(pattern, 'g'));
    
    for (const match of matches) {
      errors.push({
        type,
        severity,
        suggestion: typeof suggestion === 'function' ? suggestion(match) : suggestion,
        message: match[0],
      });
    }
  }

  return errors;
}

/**
 * Main error detection function - analyzes terminal output for all error types
 */
export function detectErrors(output: string): ErrorDetectionResult {
  const allErrors: DetectedError[] = [
    ...detectTypeScriptErrors(output),
    ...detectRuntimeErrors(output),
    ...detectBuildErrors(output),
    ...detectDependencyErrors(output),
  ];

  const hasCriticalErrors = allErrors.some(
    err => err.severity === 'error' && 
    (err.type === 'typescript' || err.type === 'runtime' || err.type === 'build')
  );

  return {
    errors: allErrors,
    hasErrors: allErrors.length > 0,
    hasCriticalErrors,
  };
}

/**
 * Get human-readable error summary
 */
export function getErrorSummary(result: ErrorDetectionResult): string {
  if (!result.hasErrors) {
    return '✅ No errors detected';
  }

  const errorCounts = result.errors.reduce((acc, err) => {
    acc[err.type] = (acc[err.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const parts: string[] = [];
  
  if (errorCounts.typescript) parts.push(`${errorCounts.typescript} TypeScript`);
  if (errorCounts.runtime) parts.push(`${errorCounts.runtime} Runtime`);
  if (errorCounts.build) parts.push(`${errorCounts.build} Build`);
  if (errorCounts.eslint) parts.push(`${errorCounts.eslint} ESLint`);
  if (errorCounts.dependency) parts.push(`${errorCounts.dependency} Dependency`);

  return `❌ ${parts.join(', ')} error${result.errors.length > 1 ? 's' : ''} detected`;
}
