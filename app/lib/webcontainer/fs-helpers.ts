// WebContainer filesystem helpers
import nodePath from '~/lib/polyfills/path.js';
import type { WebContainer } from '@webcontainer/api';

export async function mkdirp(wc: WebContainer, absFilePath: string) {
  const normalized = absFilePath.replace(/\\+/g, '/');
  if (!normalized.startsWith(wc.workdir)) {
    throw new Error(`mkdirp path escapes workdir: ${absFilePath}`);
  }

  const rel = nodePath.posix.relative(wc.workdir, normalized);
  if (!rel || rel.startsWith('..')) {
    throw new Error(`mkdirp path escapes workdir: ${absFilePath}`);
  }

  const dir = nodePath.posix.dirname(rel);

  if (!dir || dir === '.' || dir === '/') return;

  const parts = dir.split('/');
  let cur = '';

  for (const p of parts) {
    if (!p) continue;
    cur = cur ? `${cur}/${p}` : p;
    try {
      await wc.fs.mkdir(cur);
    } catch {
      // Directory might already exist, continue
    }
  }
}
