import nodePath from '~/lib/polyfills/path.js';
import { WORK_DIR } from '~/utils/constants';

function normalizeInput(targetPath: string) {
  return (targetPath || '').replace(/\\/g, '/').trim();
}

function assertWithinWorkdir(absPath: string, original: string) {
  const relative = nodePath.posix.relative(WORK_DIR, absPath);
  if (relative.startsWith('..') || (relative === '' && !absPath.startsWith(WORK_DIR))) {
    throw new Error(`Path escapes workdir: ${original}`);
  }
  return absPath;
}

export function absInWorkdir(targetPath: string): string {
  const input = normalizeInput(targetPath);

  if (!input || input === '.' || input === WORK_DIR) {
    return WORK_DIR;
  }

  if (input.startsWith(WORK_DIR)) {
    const relFromWorkdir = nodePath.posix.relative(WORK_DIR, input);
    const resolved = relFromWorkdir ? nodePath.posix.join(WORK_DIR, relFromWorkdir) : WORK_DIR;
    return assertWithinWorkdir(resolved, targetPath);
  }

  const trimmed = input.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  const joined = nodePath.posix.join(WORK_DIR, trimmed);
  return assertWithinWorkdir(joined, targetPath);
}

export function relToWorkdir(targetPath: string): string {
  const abs = absInWorkdir(targetPath);
  const relative = nodePath.posix.relative(WORK_DIR, abs);
  return relative || '.';
}
