/**
 * Static Code Analysis Pipeline
 * Pre-validates AI-generated code before execution
 */

export interface ValidationIssue {
  type: 'typescript' | 'eslint' | 'security' | 'package' | 'path';
  severity: 'error' | 'warning' | 'info';
  message: string;
  file: string;
  line?: number;
  column?: number;
  rule?: string;
  fix?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

/**
 * Validate package.json structure and dependencies
 */
export function validatePackageJson(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  try {
    const pkg = JSON.parse(content);

    // Check required fields
    if (!pkg.name) {
      issues.push({
        type: 'package',
        severity: 'error',
        message: 'Missing required field: name',
        file: 'package.json',
        fix: 'Add a "name" field to package.json',
      });
    }

    if (!pkg.version) {
      issues.push({
        type: 'package',
        severity: 'warning',
        message: 'Missing version field',
        file: 'package.json',
        fix: 'Add a "version" field (e.g., "1.0.0")',
      });
    }

    // Check for scripts
    if (!pkg.scripts || Object.keys(pkg.scripts).length === 0) {
      issues.push({
        type: 'package',
        severity: 'warning',
        message: 'No scripts defined in package.json',
        file: 'package.json',
        fix: 'Add at least a "dev" script to run the development server',
      });
    }

    // Check for dev script
    if (pkg.scripts && !pkg.scripts.dev && !pkg.scripts.start) {
      issues.push({
        type: 'package',
        severity: 'error',
        message: 'Missing "dev" or "start" script',
        file: 'package.json',
        fix: 'Add a "dev" script to start the development server',
      });
    }

    // Validate dependency versions
    const checkDeps = (deps: Record<string, string> | undefined, depType: string) => {
      if (!deps) return;

      for (const [name, version] of Object.entries(deps)) {
        // Check for invalid version formats
        if (!version || version === '') {
          issues.push({
            type: 'package',
            severity: 'error',
            message: `Invalid version for ${name} in ${depType}`,
            file: 'package.json',
            fix: `Specify a valid version for ${name}`,
          });
        }

        // Warn about using "latest" or "*"
        if (version === 'latest' || version === '*') {
          issues.push({
            type: 'package',
            severity: 'warning',
            message: `Using "${version}" for ${name} can cause unpredictable builds`,
            file: 'package.json',
            fix: `Pin ${name} to a specific version`,
          });
        }
      }
    };

    checkDeps(pkg.dependencies, 'dependencies');
    checkDeps(pkg.devDependencies, 'devDependencies');

  } catch (error) {
    issues.push({
      type: 'package',
      severity: 'error',
      message: `Invalid JSON in package.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
      file: 'package.json',
      fix: 'Fix JSON syntax errors in package.json',
    });
  }

  return issues;
}

/**
 * Validate TypeScript/JavaScript code for common issues
 */
export function validateTypeScriptCode(content: string, filename: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for 'any' types (strict typing)
  const anyTypeRegex = /:\s*any\b|<any>|as any/g;
  let match;
  let lineNumber = 1;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for 'any' types
    if (anyTypeRegex.test(line)) {
      issues.push({
        type: 'typescript',
        severity: 'warning',
        message: 'Avoid using "any" type - use specific types or "unknown"',
        file: filename,
        line: i + 1,
        rule: 'no-explicit-any',
        fix: 'Replace "any" with a specific type or "unknown" for truly dynamic values',
      });
    }

    // Check for console.log in production code (not in dev/test files)
    if (!filename.includes('.test.') && !filename.includes('.spec.') && line.includes('console.log')) {
      issues.push({
        type: 'eslint',
        severity: 'warning',
        message: 'Avoid console.log in production code',
        file: filename,
        line: i + 1,
        rule: 'no-console',
        fix: 'Remove console.log or use a proper logging library',
      });
    }

    // Check for TODO/FIXME comments
    if (/\/\/\s*(TODO|FIXME)/i.test(line)) {
      issues.push({
        type: 'eslint',
        severity: 'info',
        message: 'TODO/FIXME comment found',
        file: filename,
        line: i + 1,
        rule: 'no-warning-comments',
      });
    }

    // Check for missing error handling in async functions
    if (line.includes('async ') && i + 10 < lines.length) {
      const nextLines = lines.slice(i, i + 10).join('\n');
      if (!nextLines.includes('try') && !nextLines.includes('catch') && nextLines.includes('await')) {
        issues.push({
          type: 'typescript',
          severity: 'warning',
          message: 'Async function without try-catch block',
          file: filename,
          line: i + 1,
          fix: 'Wrap await calls in try-catch for proper error handling',
        });
      }
    }

    // Check for non-null assertions (!.)
    if (line.includes('!.') || line.includes('!;') || line.includes('!)')) {
      issues.push({
        type: 'typescript',
        severity: 'warning',
        message: 'Non-null assertion operator used - prefer optional chaining or null checks',
        file: filename,
        line: i + 1,
        rule: 'no-non-null-assertion',
        fix: 'Use optional chaining (?.) or explicit null checks instead',
      });
    }
  }

  return issues;
}

/**
 * Check for common security vulnerabilities
 */
export function validateSecurity(content: string, filename: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for hardcoded secrets/API keys
    const secretPatterns = [
      /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
      /secret\s*=\s*['"][^'"]+['"]/i,
      /password\s*=\s*['"][^'"]+['"]/i,
      /token\s*=\s*['"][^'"]+['"]/i,
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(line) && !line.includes('process.env')) {
        issues.push({
          type: 'security',
          severity: 'error',
          message: 'Potential hardcoded secret detected',
          file: filename,
          line: i + 1,
          rule: 'no-hardcoded-secrets',
          fix: 'Use environment variables: process.env.YOUR_SECRET',
        });
      }
    }

    // Check for eval() usage
    if (line.includes('eval(')) {
      issues.push({
        type: 'security',
        severity: 'error',
        message: 'eval() is dangerous and should be avoided',
        file: filename,
        line: i + 1,
        rule: 'no-eval',
        fix: 'Find alternative solutions that don\'t use eval()',
      });
    }

    // Check for dangerouslySetInnerHTML without sanitization
    if (line.includes('dangerouslySetInnerHTML') && !line.includes('sanitize') && !line.includes('DOMPurify')) {
      issues.push({
        type: 'security',
        severity: 'error',
        message: 'dangerouslySetInnerHTML without sanitization - XSS risk',
        file: filename,
        line: i + 1,
        rule: 'no-danger',
        fix: 'Sanitize HTML content before rendering or use safer alternatives',
      });
    }

    // Check for SQL injection risks
    if (line.includes('query') && line.includes('+') && (line.includes('SELECT') || line.includes('INSERT'))) {
      issues.push({
        type: 'security',
        severity: 'error',
        message: 'Potential SQL injection - use parameterized queries',
        file: filename,
        line: i + 1,
        rule: 'no-sql-injection',
        fix: 'Use parameterized queries or an ORM instead of string concatenation',
      });
    }
  }

  return issues;
}

/**
 * Validate file paths and imports
 */
export function validateFilePaths(content: string, filename: string, allFiles: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split('\n');

  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const imports = [...line.matchAll(importRegex), ...line.matchAll(requireRegex)];

    for (const match of imports) {
      const importPath = match[1];

      // Check for relative imports
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        // Verify file exists (basic check - would need filesystem access for complete validation)
        const isLikelyFile = importPath.endsWith('.ts') || 
                            importPath.endsWith('.tsx') || 
                            importPath.endsWith('.js') ||
                            importPath.endsWith('.jsx');

        if (!isLikelyFile && !importPath.endsWith('/')) {
          issues.push({
            type: 'path',
            severity: 'warning',
            message: `Relative import without file extension: ${importPath}`,
            file: filename,
            line: i + 1,
            fix: 'Add file extension to relative imports for clarity',
          });
        }
      }

      // Check for overly long relative paths
      if (importPath.startsWith('../../../')) {
        issues.push({
          type: 'path',
          severity: 'info',
          message: 'Deep relative import path - consider using path aliases',
          file: filename,
          line: i + 1,
          fix: 'Use TypeScript path aliases (@/) instead of deep relative paths',
        });
      }
    }
  }

  return issues;
}

/**
 * Main validation function - runs all validators
 */
export function validateCode(
  files: Record<string, string>
): ValidationResult {
  const allIssues: ValidationIssue[] = [];

  for (const [filename, content] of Object.entries(files)) {
    if (filename === 'package.json') {
      allIssues.push(...validatePackageJson(content));
    } else if (filename.endsWith('.ts') || filename.endsWith('.tsx') || 
               filename.endsWith('.js') || filename.endsWith('.jsx')) {
      allIssues.push(...validateTypeScriptCode(content, filename));
      allIssues.push(...validateSecurity(content, filename));
      allIssues.push(...validateFilePaths(content, filename, Object.keys(files)));
    }
  }

  const errorCount = allIssues.filter(i => i.severity === 'error').length;
  const warningCount = allIssues.filter(i => i.severity === 'warning').length;
  const infoCount = allIssues.filter(i => i.severity === 'info').length;

  return {
    valid: errorCount === 0,
    issues: allIssues,
    errorCount,
    warningCount,
    infoCount,
  };
}

/**
 * Generate validation report
 */
export function generateValidationReport(result: ValidationResult): string {
  if (result.valid && result.issues.length === 0) {
    return '✅ Code validation passed with no issues!';
  }

  const lines: string[] = [];
  
  lines.push(`📊 Code Validation Report:`);
  lines.push(`   Errors: ${result.errorCount}`);
  lines.push(`   Warnings: ${result.warningCount}`);
  lines.push(`   Info: ${result.infoCount}`);
  lines.push('');

  // Group by severity
  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');
  const infos = result.issues.filter(i => i.severity === 'info');

  if (errors.length > 0) {
    lines.push('❌ ERRORS:');
    errors.forEach((issue, idx) => {
      lines.push(`${idx + 1}. ${issue.file}${issue.line ? `:${issue.line}` : ''} - ${issue.message}`);
      if (issue.fix) lines.push(`   💡 ${issue.fix}`);
    });
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push('⚠️  WARNINGS:');
    warnings.forEach((issue, idx) => {
      lines.push(`${idx + 1}. ${issue.file}${issue.line ? `:${issue.line}` : ''} - ${issue.message}`);
      if (issue.fix) lines.push(`   💡 ${issue.fix}`);
    });
    lines.push('');
  }

  if (infos.length > 0 && infos.length <= 5) {
    lines.push('ℹ️  INFO:');
    infos.forEach((issue, idx) => {
      lines.push(`${idx + 1}. ${issue.file}${issue.line ? `:${issue.line}` : ''} - ${issue.message}`);
    });
  }

  return lines.join('\n');
}
