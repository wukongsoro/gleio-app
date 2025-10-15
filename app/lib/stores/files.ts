import type { PathWatcherEvent, WebContainer } from '@webcontainer/api';
import { getEncoding } from 'istextorbinary';
import { map, type MapStore } from 'nanostores';
import { Buffer } from 'buffer';
import nodePath from '~/lib/polyfills/path.js';
import { bufferWatchEvents } from '~/utils/buffer';
import { WORK_DIR } from '~/utils/constants';
import { computeFileModifications } from '~/utils/diff';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import { webcontainerContext } from '~/lib/webcontainer';
import { workbenchStore } from '~/lib/stores/workbench';
import { mkdirp } from '~/lib/webcontainer/fs-helpers';
import { absInWorkdir, relToWorkdir } from '~/lib/webcontainer/path';

const logger = createScopedLogger('FilesStore');

const utf8TextDecoder = new TextDecoder('utf8', { fatal: true });
const FILE_WRITE_DEBOUNCE_MS = 250;
const INSTALL_LOG_LINE_LIMIT = 2000;
const INSTALL_WATCHDOG_MS = 120_000;

class InstallLogBuffer {
  #limit: number;
  #lines: string[] = [];
  #pending = '';

  constructor(limit = INSTALL_LOG_LINE_LIMIT) {
    this.#limit = limit;
  }

  append(chunk: string) {
    if (!chunk) return;
    const data = this.#pending + chunk;
    const parts = data.split(/\r?\n/);
    this.#pending = parts.pop() ?? '';

    for (const line of parts) {
      this.#lines.push(line);
      if (this.#lines.length > this.#limit) {
        this.#lines.shift();
      }
    }
  }

  flush() {
    if (!this.#pending) return;
    this.#lines.push(this.#pending);
    if (this.#lines.length > this.#limit) {
      this.#lines.shift();
    }
    this.#pending = '';
  }

  tail() {
    return [...this.#lines].slice(-this.#limit);
  }
}

// Check if package.json exists in WebContainer filesystem
async function containerHasPackageJson(
  wc: WebContainer,
  projectRootAbs: string
): Promise<boolean> {
  const rootAbs = absInWorkdir(projectRootAbs);
  const relRoot = relToWorkdir(rootAbs);
  const rel = nodePath.posix.join(relRoot, 'package.json');
  try {
    await wc.fs.readFile(rel);
    return true;
  } catch {
    return false;
  }
}

// Memory management constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit per file
const MAX_TOTAL_FILES = 6000; // Maximum number of files to track (allows larger templates without churn)
const MAX_CONTENT_LENGTH = 1024 * 1024; // 1MB limit for file content in memory

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
}

export interface Folder {
  type: 'folder';
}

type Dirent = File | Folder;

type PendingWrite = {
  timer: number;
  content: string;
  resolvers: Array<(value: void) => void>;
  rejectors: Array<(reason: unknown) => void>;
};

export type FileMap = Record<string, Dirent | undefined>;

export class FilesStore {
  #webcontainer: Promise<WebContainer>;

  /**
   * Track the currently running dev server process to avoid duplicates
   */
  #devProcess: any | null = null;

  /**
   * Track installation state and retries
   */
  #isInstalling = false;

  /**
   * Detected project root (directory containing package.json); '/' means workdir root
   */
  #projectRoot: string | null = null;

  /**
   * Debounce timers for preventing rapid file change events
   */
  #debounceTimers = new Map<string, number>();

  /**
   * Pending WebContainer write operations keyed by absolute path
   */
  #pendingWrites: Map<string, PendingWrite> = new Map();

  /**
   * Tracks the number of files without folders.
   */
  #size = 0;

  /**
   * @note Keeps track all modified files with their original content since the last user message.
   * Needs to be reset when the user sends another message and all changes have to be submitted
   * for the model to be aware of the changes.
   */
  #modifiedFiles: Map<string, string> = import.meta.hot?.data.modifiedFiles ?? new Map();

  /**
   * Bootstrap function for auto-starting dev servers
   */
  tryBootstrap?: () => Promise<void>;

  /**
   * Track if bootstrap has been attempted to avoid duplicate runs
   */
  bootstrapAttempted = false;
  #previewReadyPorts = new Set<number>();
  #previewPort: number | null = null;
  #currentPort: number | null = null;
  #installFailed = false;
  #installFailureSignature: string | null = null;
  #installFailureLogged = false;
  #pendingPreviewChecks = new Set<number>();

  /**
   * Track the current bootstrap mode (dev server vs static fallback)
   */
  #bootstrapMode: 'idle' | 'static' | 'dev' = 'idle';
  #bootstrapRunning = false;
  #bootstrapSkipLogged = false;
  #installSkipLogged = false;

  /**
   * Initialization guards to prevent duplicate setup and instance pressure
   */
  #initInProgress = false;
  #initialized = false;
  #postReadyInitDone = false;

  /**
   * Map of files that matches the state of WebContainer.
   */
  files: MapStore<FileMap> = import.meta.hot?.data.files ?? map({});

  get filesCount() {
    return this.#size;
  }

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.files = this.files;
      import.meta.hot.data.modifiedFiles = this.#modifiedFiles;
    }

    // Listen for WebContainer readiness event
    if (typeof window !== 'undefined') {
      window.addEventListener('webcontainer-ready', () => {
        // Reset bootstrap attempt flag when transitioning from fallback to ready
        this.bootstrapAttempted = false;
        // Trigger bootstrap now that WebContainer is ready
        this.tryBootstrap?.();
      }, { once: false }); // Allow multiple calls if WebContainer restarts
    }

    this.#init();
  }

  getFile(filePath: string) {
    const dirent = this.files.get()[filePath];

    if (dirent?.type !== 'file') {
      return undefined;
    }

    return dirent;
  }

  getFileModifications() {
    return computeFileModifications(this.files.get(), this.#modifiedFiles);
  }

  resetFileModifications() {
    this.#modifiedFiles.clear();
  }

  #enforceMemoryLimits() {
    const files = this.files.get();
    const fileEntries = Object.entries(files).filter(([_, dirent]) => dirent?.type === 'file');
    
    // If we exceed the max file count, remove oldest files
    if (fileEntries.length > MAX_TOTAL_FILES) {
      const excessCount = fileEntries.length - MAX_TOTAL_FILES;
      for (let i = 0; i < excessCount; i++) {
        const [filePath] = fileEntries[i];
        this.files.setKey(filePath, undefined);
        this.#modifiedFiles.delete(filePath);
        this.#size--;
      }
      logger.debug(`Removed ${excessCount} files to enforce memory limits`);
    }
  }

  #isFileSizeAcceptable(buffer?: Uint8Array): boolean {
    if (!buffer) return true;
    return buffer.byteLength <= MAX_FILE_SIZE;
  }

  #shouldLoadFileContent(buffer?: Uint8Array): boolean {
    if (!buffer) return true;
    return buffer.byteLength <= MAX_CONTENT_LENGTH;
  }

  async saveFile(filePath: string, content: string) {
    const absPath = absInWorkdir(filePath);
    await this.#scheduleFileWrite(absPath, content);
  }

  #scheduleFileWrite(absPath: string, content: string) {
    return new Promise<void>((resolve, reject) => {
      const existing = this.#pendingWrites.get(absPath);

      if (existing) {
        clearTimeout(existing.timer);
        existing.content = content;
        existing.resolvers.push(resolve);
        existing.rejectors.push(reject);
        existing.timer = this.#createWriteTimer(absPath);
        return;
      }

      const pending: PendingWrite = {
        content,
        resolvers: [resolve],
        rejectors: [reject],
        timer: 0,
      };

      pending.timer = this.#createWriteTimer(absPath);
      this.#pendingWrites.set(absPath, pending);
    });
  }

  #createWriteTimer(absPath: string) {
    return setTimeout(() => {
      this.#flushPendingWrite(absPath).catch((error) => {
        logger.error(`Failed to flush write for ${absPath}:`, error);
      });
    }, FILE_WRITE_DEBOUNCE_MS) as unknown as number;
  }

  async #flushPendingWrite(absPath: string) {
    const pending = this.#pendingWrites.get(absPath);
    if (!pending) {
      return;
    }

    this.#pendingWrites.delete(absPath);
    clearTimeout(pending.timer);

    try {
      const webcontainer = await this.#webcontainer;
      const relPath = relToWorkdir(absPath);
      const existingContent = this.getFile(absPath)?.content;

      if (existingContent === pending.content) {
        logger.debug(`Skipping write for unchanged file: ${absPath}`);
        pending.resolvers.forEach((resolve) => resolve());
        return;
      }

      await mkdirp(webcontainer, absPath);
      await webcontainer.fs.writeFile(relPath, pending.content);

      if (!this.#modifiedFiles.has(absPath)) {
        this.#modifiedFiles.set(absPath, existingContent ?? '');
      }

      this.files.setKey(absPath, { type: 'file', content: pending.content, isBinary: false });
      if (!relPath.startsWith('.bolt/') && relPath !== '.bolt') {
        this.#installFailed = false;
        this.#installFailureSignature = null;
        this.#installFailureLogged = false;
      }
      logger.debug(`File updated in WebContainer and editor: ${absPath}`);
      pending.resolvers.forEach((resolve) => resolve());
    } catch (error) {
      pending.rejectors.forEach((reject) => reject(error));
      throw error;
    }
  }

  async #init() {
    if (this.#initInProgress || this.#initialized) {
      return;
    }

    this.#initInProgress = true;

    try {
      const webcontainer = await this.#webcontainer;

      webcontainer.internal.watchPaths(
        { include: [`${WORK_DIR}/**`], exclude: ['**/node_modules', '.git'], includeContent: true },
        bufferWatchEvents(100, this.#processEventBuffer.bind(this)),
      );
      
      logger.info('FilesStore initialized successfully');

      // Auto-bootstrap: when package.json exists in WebContainer, install deps and start dev server
      const tryBootstrap = async () => {
        try {
          logger.info('🔄 Auto-bootstrap triggered');

          const wc = await this.#webcontainer;
          const targetPort = this.#getSafePort();
          this.#previewPort = targetPort;
          this.#currentPort = targetPort;
          this.#previewReadyPorts.clear();

          if (this.#bootstrapMode === 'static' && this.#installFailed) {
            if (!this.#installFailureLogged) {
              logger.info('⏭️ Install previously failed; waiting for code changes before retrying');
              this.#installFailureLogged = true;
            }
            return;
          }

          // Guard: WebContainer must be ready
          if (!webcontainerContext.ready) {
            logger.info('⏭️ WebContainer not ready; skipping bootstrap');
            return;
          }

          // Guard: avoid overlapping bootstraps
          if (this.#bootstrapRunning) {
            if (!this.#bootstrapSkipLogged) {
              logger.info('⏭️ Bootstrap already running; skipping');
              this.#bootstrapSkipLogged = true;
            }
            return;
          }

          if (this.#isInstalling) {
            if (!this.#installSkipLogged) {
              logger.info('⏭️ Installation already in progress; skipping bootstrap');
              this.#installSkipLogged = true;
            }
            return;
          }

          if (this.#devProcess && this.#bootstrapMode !== 'static') {
            logger.info('⏭️ Dev server already running; skipping bootstrap');
            return;
          }

          this.#bootstrapRunning = true;
          this.#bootstrapSkipLogged = false;
          this.#installSkipLogged = false;

          // Find package.json in editor map (watcher-reported paths)
          const files = this.files.get();
          const staticEntry = this.#findStaticEntry(files);
          const pkgCandidates = Object.entries(files)
            .filter(([_, dirent]) => dirent?.type === 'file')
            .map(([filePath]) => {
              try {
                const absPath = absInWorkdir(filePath);
                return absPath && absPath.endsWith('/package.json') ? absPath : null;
              } catch {
                return null;
              }
            })
            .filter((absPath): absPath is string => absPath !== null)
            .sort((a, b) => a.length - b.length);

          if (!pkgCandidates.length) {
            if (staticEntry) {
              await this.#startStaticPreview({ rootAbs: staticEntry.rootAbs, reason: 'no-package', port: targetPort });
            } else {
              logger.info('No package.json or static entry detected yet');
              this.bootstrapAttempted = false;
            }
            return;
          }

          const pkgPathAbs = pkgCandidates[0];
          const projectRootAbs = nodePath.posix.dirname(pkgPathAbs);
          const projectRootRel = relToWorkdir(projectRootAbs);

          // Check if package.json actually exists in WebContainer
          if (!(await containerHasPackageJson(wc, projectRootAbs))) {
            logger.info('package.json not yet in WebContainer; postpone bootstrap');
            // IMPORTANT: do NOT set bootstrapAttempted here
            return;
          }

          if (this.#bootstrapMode === 'static') {
            await this.#stopCurrentProcess();
          }

          // Now we know package.json exists in container - mark as attempted
          this.bootstrapAttempted = true;
          this.#projectRoot = projectRootRel === '.' ? '/' : `/${projectRootRel}`;
          logger.info(`📦 PROJECT_ROOT set to: ${projectRootAbs}`);

          // Check if node_modules exists
          const nodeModulesRel = projectRootRel === '.'
            ? 'node_modules'
            : nodePath.posix.join(projectRootRel, 'node_modules');
          let hasNodeModules = false;
          try {
            await wc.fs.readdir(nodeModulesRel);
            hasNodeModules = true;
            logger.info('📁 node_modules exists');
          } catch {
            logger.info('📁 node_modules missing');
          }

          const pkgRel = nodePath.posix.join(projectRootRel, 'package.json');
          const pkgContent = await wc.fs.readFile(pkgRel, 'utf-8');
          logger.info(`📄 package.json content length: ${pkgContent.length}`);

          if (this.#installFailed && this.#installFailureSignature && this.#installFailureSignature === pkgContent) {
            if (!this.#installFailureLogged) {
              logger.warn('⏭️ Skipping install retry; package.json unchanged since previous failure');
              this.#installFailureLogged = true;
            }
            return;
          }

          this.#installFailureLogged = false;

          let pkg = JSON.parse(pkgContent);

          const installOutcome = await this.#ensureDependenciesInstalled(wc, projectRootAbs, projectRootRel, pkgRel, pkg, hasNodeModules);
          if (!installOutcome.success) {
            const logs = installOutcome.failureTail?.length
              ? installOutcome.failureTail.join('\n')
              : 'No additional install output captured.';
            const fallbackMessage = `Dependency installation failed after multiple attempts.\n\nRecent output:\n${logs}`;
            this.#installFailed = true;
            this.#installFailureSignature = pkgContent;
            this.#installFailureLogged = false;
            await this.#startStaticPreview({
              rootAbs: projectRootAbs,
              reason: 'install-failed',
              fallbackMessage,
              port: targetPort,
              pkgSignature: pkgContent,
            });
            return;
          }

          pkg = installOutcome.pkg;

          const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) } as Record<string, string>;
          const hasVite = typeof deps['vite'] === 'string';
          const hasNext = typeof deps['next'] === 'string';

          pkg = await this.#normalizeDevScript(wc, pkgRel, pkg, { hasNext, hasVite });

          await this.#ensureScaffolding(pkg, projectRootAbs);

          const hasDevScript = Boolean(pkg?.scripts?.dev);
          logger.info(`🚀 Has dev script: ${hasDevScript}, script: ${pkg?.scripts?.dev || 'none'}`);

          const headerPatchRequireArg = await this.#ensurePreviewHeaderPatch(wc, projectRootAbs);

          const devCommand = this.#buildDevCommand({ hasDevScript, hasNext, hasVite }, targetPort);
          if (!devCommand) {
            logger.warn('⚠️ Unable to determine dev server command; falling back to static preview');
            await this.#startStaticPreview({
              rootAbs: projectRootAbs,
              reason: 'no-dev-command',
              fallbackMessage: 'Unable to determine the correct dev server command. Serving the latest generated files statically.',
              port: targetPort,
            });
            return;
          }

          const cmd = `cd ${projectRootAbs} && ${devCommand}`;

          logger.info('🌐 Starting dev server');
          logger.info(`📝 Dev command: ${cmd}`);
          const spawnEnv: Record<string, string> = {
            HOST: '0.0.0.0',
            PORT: String(targetPort),
            HOSTNAME: '0.0.0.0',
          };

          if (headerPatchRequireArg) {
            spawnEnv.NODE_OPTIONS = [spawnEnv.NODE_OPTIONS, headerPatchRequireArg].filter(Boolean).join(' ').trim();
          }

          logger.info(`🔧 Environment: PORT=${targetPort}, HOST=0.0.0.0`);

          await this.#stopCurrentProcess({ resetBootstrap: false, resetPreview: false });
          this.bootstrapAttempted = true;

          this.#devProcess = await wc.spawn('/bin/jsh', ['-c', cmd], {
            env: spawnEnv,
          });
          logger.info('✅ Dev server process spawned');
          this.#bootstrapMode = 'dev';

          // Watch dev server output
          const outputDecoder = new TextDecoder();
          let readinessBuffer = '';
          let hasLoggedFirstOutput = false;
          let readinessScheduled = false;
          this.#devProcess.output
            .pipeTo(
              new WritableStream({
                write: (data) => {
                  const chunk = typeof data === 'string'
                    ? data
                    : outputDecoder.decode(data as Uint8Array, { stream: true });

                  if (!hasLoggedFirstOutput && chunk.trim()) {
                    logger.info('📡 First dev server output received');
                    hasLoggedFirstOutput = true;
                  }

                  readinessBuffer = `${readinessBuffer}${chunk}`.slice(-4000);
                  workbenchStore.writeToTerminals(chunk);

                  // Auto-detect and fix common Next.js errors
                  void this.#detectAndFixErrors(chunk, projectRootAbs);

                  // Log errors immediately
                  if (/error|err|fail|crash/i.test(chunk.toLowerCase()) && chunk.trim()) {
                    logger.error(`❌ Dev server error: ${chunk.substring(0, 200)}`);
                  }

                  // Skip localhost-based readiness check - PreviewsStore handles this via WebContainer port events
                  if (!readinessScheduled && this.#hasReadinessSignal(readinessBuffer, targetPort)) {
                    readinessScheduled = true;
                    logger.info(`🎯 Dev server readiness detected for port ${targetPort} (preview URL will be set by WebContainer port event)`);
                    // PreviewsStore.portHandler already called markPreviewReady with the real WebContainer URL
                  }
                },
                close: () => {
                  const residual = outputDecoder.decode();
                  if (residual) {
                    readinessBuffer = `${readinessBuffer}${residual}`.slice(-4000);
                    workbenchStore.writeToTerminals(residual);
                  }
                },
              }),
            )
            .catch(() => {});

          // Reset pointer when process exits
          this.#devProcess.exit.then((exitCode: number) => {
            logger.warn(`⚠️ Dev server process exited with code ${exitCode}`);
            this.#devProcess = null;
            if (this.#bootstrapMode === 'dev') {
              this.#bootstrapMode = 'idle';
            }
            this.#currentPort = null;
            this.#previewReadyPorts.clear();
            this.bootstrapAttempted = false;
          }).catch((error: unknown) => {
            logger.error(`❌ Dev server process error:`, error);
            this.#devProcess = null;
            if (this.#bootstrapMode === 'dev') {
              this.#bootstrapMode = 'idle';
            }
            this.#currentPort = null;
            this.#previewReadyPorts.clear();
            this.bootstrapAttempted = false;
          });

        } catch (e) {
          logger.error('❌ Auto-bootstrap failed (non-fatal):', e instanceof Error ? e.message : String(e));
        } finally {
          this.#bootstrapRunning = false;
          this.#bootstrapSkipLogged = false;
          this.#installSkipLogged = false;
        }
      };

      // Store the bootstrap function for reuse
      this.tryBootstrap = tryBootstrap;

      // Don't run initial bootstrap - wait for package.json to be created
      this.#initialized = true;
    } catch (error) {
      logger.error('Failed to initialize FilesStore with WebContainer:', error);

      // Reset all run state so a later successful init can proceed cleanly
      this.#devProcess = null;
      this.#bootstrapMode = 'idle';
      this.#currentPort = null;
      this.#previewReadyPorts.clear();
      this.bootstrapAttempted = false;
      
      // Set up enhanced fallback mode without file watching but with manual file support
      const fallbackFiles: FileMap = {
        [absInWorkdir('package.json')]: {
          type: 'file',
          content: '{\n  "name": "fallback-project",\n  "version": "1.0.0",\n  "private": true,\n  "description": "Project running in fallback mode - WebContainer failed to initialize"\n}',
          isBinary: false,
        },
        [absInWorkdir('README.md')]: {
          type: 'file',
          content: '# Project in Fallback Mode\n\nWebContainer failed to initialize, but files generated by the AI will still be visible here.\n\n## Troubleshooting\n\n1. Close other browser tabs and refresh\n2. Try a different browser (Chrome/Firefox work best)\n3. Check your system memory (need ~4GB+ available)\n4. Run `window.emergencyMemoryCleanup()` in the browser console\n\n## Manual Preview\n\nIf you have files that should be served, you can:\n- Copy the generated code to your local editor\n- Run it locally with your preferred dev server\n- Check these URLs manually: http://localhost:5173, http://localhost:5174, etc.',
          isBinary: false,
        },
      };

      this.files.set(fallbackFiles);

      logger.warn('FilesStore running in enhanced fallback mode without WebContainer - manual file operations still supported');

      // Provide a guarded bootstrap hook in fallback mode. It will only attempt
      // re-initialization once the WebContainer reports ready, and only once.
      this.tryBootstrap = async () => {
        if (!webcontainerContext.ready) {
          logger.info('⏭️ WebContainer still not ready; delaying bootstrap retry');
          return;
        }
        if (this.#postReadyInitDone || this.#initInProgress || this.#initialized) {
          return;
        }
        this.#postReadyInitDone = true;
        logger.info('🔁 Retrying FilesStore initialization after WebContainer became ready');
        await this.#init();
      };
    }
    finally {
      this.#initInProgress = false;
      // Mark fully initialized only on success path above where watchers are attached
      // To avoid mis-marking here, keep #initialized set inside the success branch
    }
  }

  #processEventBuffer(events: Array<[events: PathWatcherEvent[]]>) {
    const watchEvents = events.flat(2);

    for (const { type, path, buffer } of watchEvents) {
      try {
        const sanitizedPath = path.replace(/\/+$/g, '');
        const candidatePath = sanitizedPath || path;

        if (this.#shouldIgnorePath(candidatePath)) {
          continue;
        }

        switch (type) {
          case 'add_dir': {
            const absDir = absInWorkdir(candidatePath);
            this.files.setKey(absDir, { type: 'folder' });
            break;
          }
          case 'remove_dir': {
            const absDir = absInWorkdir(candidatePath);
            this.files.setKey(absDir, undefined);

            for (const [direntPath] of Object.entries(this.files.get())) {
              if (direntPath === absDir || direntPath.startsWith(`${absDir}/`)) {
                this.files.setKey(direntPath, undefined);
                this.#modifiedFiles.delete(direntPath);
              }
            }

            break;
          }
          case 'add_file':
          case 'change': {
            const absFilePath = absInWorkdir(candidatePath);

            if (!this.#isFileSizeAcceptable(buffer)) {
              logger.warn(`File ${absFilePath} exceeds size limit (${buffer?.byteLength} bytes), skipping`);
              break;
            }

            if (type === 'add_file' && !this.files.get()[absFilePath]) {
              this.#size++;
              this.#enforceMemoryLimits();
            }

            let content = '';
            const isBinary = isBinaryFile(buffer);

            if (!isBinary && this.#shouldLoadFileContent(buffer)) {
              content = this.#decodeFileContent(buffer);
            } else if (!isBinary) {
              content = `[File too large to display: ${buffer?.byteLength || 0} bytes]`;
            }

            this.files.setKey(absFilePath, { type: 'file', content, isBinary });

            const isPackageJson = this.#isPackageJsonPath(absFilePath);

            if (isPackageJson && this.tryBootstrap) {
              // Only reset bootstrapAttempted if we're in static mode and need to retry
              if (this.#bootstrapMode === 'static' && !this.#installFailed) {
                this.bootstrapAttempted = false;
              }
              
              // Don't re-trigger bootstrap if:
              // 1. Bootstrap is already running
              // 2. Dev server is already running
              // 3. Installation is in progress
              if (this.#bootstrapRunning || this.#devProcess || this.#isInstalling) {
                logger.debug('⏭️ Skipping package.json bootstrap trigger (bootstrap running, dev server active, or installing)');
                return;
              }
              
              const existingTimer = this.#debounceTimers.get('bootstrap-pkg');
              if (existingTimer) {
                clearTimeout(existingTimer);
              }

              this.#debounceTimers.set(
                'bootstrap-pkg',
                setTimeout(() => {
                  logger.info('📋 package.json file event detected, triggering bootstrap');
                  if (webcontainerContext.ready && !this.bootstrapAttempted && !this.#bootstrapRunning) {
                    this.tryBootstrap?.();
                  }
                  this.#debounceTimers.delete('bootstrap-pkg');
                }, 1000) as unknown as number,
              );
            }

            if (type === 'add_file' && this.tryBootstrap) {
              const existingTimer = this.#debounceTimers.get('bootstrap-file');
              if (existingTimer) {
                clearTimeout(existingTimer);
              }

              this.#debounceTimers.set(
                'bootstrap-file',
                setTimeout(() => {
                  const files = this.files.get();
                  const hasPkg = Object.entries(files).some(([filePath, dirent]) => dirent?.type === 'file' && this.#isPackageJsonPath(filePath));
                  const hasStaticEntry = this.#findStaticEntry(files) !== null;
                  if ((hasPkg || hasStaticEntry) && webcontainerContext.ready && !this.bootstrapAttempted) {
                    logger.info('📦 Project scaffold detected, running bootstrap');
                    this.tryBootstrap?.();
                  }
                  this.#debounceTimers.delete('bootstrap-file');
                }, 1500) as unknown as number,
              );
            }

            break;
          }
          case 'remove_file': {
            const absFilePath = absInWorkdir(candidatePath);
            if (this.files.get()[absFilePath]) {
              this.#size = Math.max(0, this.#size - 1);
            }
            this.files.setKey(absFilePath, undefined);
            this.#modifiedFiles.delete(absFilePath);
            break;
          }
          case 'update_directory': {
            break;
          }
        }
      } catch (error) {
        logger.error(`Error processing file event for ${path}:`, error);
        // Continue processing other events even if one fails
      }
    }
  }

  #shouldIgnorePath(p: string) {
    const normalized = p.replace(/\\+/g, '/').replace(/^\/+/g, '');
    const normalizedLower = normalized.toLowerCase();
    const parts = normalizedLower.split('/');
    const ignoredSegments = new Set(['node_modules', '.pnpm', '.turbo', '.git', '.next', 'dist']);

    if (parts.some((segment) => ignoredSegments.has(segment))) {
      return true;
    }

    if (normalizedLower.includes('/.bolt/.cache') || normalizedLower.startsWith('.bolt/.cache')) {
      return true;
    }

    return false;
  }

  #decodeFileContent(buffer?: Uint8Array) {
    if (!buffer || buffer.byteLength === 0) {
      return '';
    }

    try {
      return utf8TextDecoder.decode(buffer);
    } catch (error) {
      console.log(error);
      return '';
    }
  }

  #isPackageJsonPath(filePath: string) {
    try {
      const rel = relToWorkdir(filePath);
      return rel === 'package.json' || rel.endsWith('/package.json');
    } catch {
      return false;
    }
  }

  #findStaticEntry(files: FileMap) {
    const candidates = Object.entries(files)
      .filter(([filePath, dirent]) => dirent?.type === 'file' && this.#isStaticEntryPath(filePath))
      .map(([filePath]) => filePath)
      .sort((a, b) => a.length - b.length);

    if (!candidates.length) {
      return null;
    }

    const indexAbs = candidates[0];
    const rootAbs = nodePath.posix.dirname(indexAbs);

    return { indexAbs, rootAbs };
  }

  #isStaticEntryPath(filePath: string) {
    try {
      const rel = relToWorkdir(filePath);
      if (rel.startsWith('.bolt/')) {
        return false;
      }
      const lower = rel.toLowerCase();
      return lower === 'index.html' ||
        lower === 'index.htm' ||
        lower.endsWith('/index.html') ||
        lower.endsWith('/index.htm');
    } catch {
      return false;
    }
  }

  async #ensurePreviewHeaderPatch(wc: WebContainer, projectRootAbs: string): Promise<string | undefined> {
    try {
      const patchDirAbs = nodePath.posix.join(projectRootAbs, '.bolt');
      const patchFileAbs = nodePath.posix.join(patchDirAbs, 'corp-patch.cjs');
      const patchDirRel = relToWorkdir(patchDirAbs);
      const patchFileRel = relToWorkdir(patchFileAbs);

      try {
        await wc.fs.mkdir(patchDirRel);
      } catch {
        // Directory likely exists
      }

      const patchContent = `"use strict";

const http = require('http');

function shouldSuppressHeader(name) {
  const lower = String(name || '').toLowerCase();
  return lower === 'cross-origin-opener-policy' || lower === 'cross-origin-embedder-policy' || lower === 'origin-agent-cluster';
}

function sanitizeHeader(name, value) {
  const lower = String(name || '').toLowerCase();
  if (lower === 'cross-origin-resource-policy') {
    return 'cross-origin';
  }
  return value;
}

function normalizeHeaderValue(name, value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeHeader(name, item));
  }
  return sanitizeHeader(name, value);
}

const originalSetHeader = http.ServerResponse.prototype.setHeader;
http.ServerResponse.prototype.setHeader = function patchedSetHeader(name, value) {
  if (shouldSuppressHeader(name)) {
    return this;
  }
  const sanitizedValue = normalizeHeaderValue(name, value);
  return originalSetHeader.call(this, name, sanitizedValue);
};

const originalWriteHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function patchedWriteHead(statusCode, reasonPhrase, headers) {
  if (typeof reasonPhrase === 'object' && reasonPhrase !== null) {
    headers = reasonPhrase;
    reasonPhrase = undefined;
  }

  if (headers && typeof headers === 'object') {
    for (const key of Object.keys(headers)) {
      if (shouldSuppressHeader(key)) {
        delete headers[key];
        continue;
      }
      headers[key] = normalizeHeaderValue(key, headers[key]);
    }
  }

  if (reasonPhrase !== undefined) {
    return originalWriteHead.call(this, statusCode, reasonPhrase, headers);
  }
  return originalWriteHead.call(this, statusCode, headers);
};
`;

      const existing = await wc.fs.readFile(patchFileRel, 'utf-8').catch(() => null);
      if (existing !== patchContent) {
        await wc.fs.writeFile(patchFileRel, patchContent);
      }

      // Relative to project root when used via NODE_OPTIONS
      return '--require ./.bolt/corp-patch.cjs';
    } catch (error) {
      logger.warn('Failed to prepare preview header patch:', error);
      return undefined;
    }
  }

  #buildDevCommand(
    options: { hasDevScript: boolean; hasNext: boolean; hasVite: boolean },
    port: number,
  ): string | null {
    if (options.hasNext) {
      return `pnpm exec next dev --port ${port} --hostname 0.0.0.0`;
    }

    if (options.hasVite) {
      return `pnpm exec vite --host 0.0.0.0 --port ${port}`;
    }

    if (options.hasDevScript) {
      return `HOST=0.0.0.0 PORT=${port} pnpm run dev`;
    }

    return null;
  }

  async #normalizeDevScript(
    wc: WebContainer,
    pkgRel: string,
    pkg: any,
    options: { hasNext: boolean; hasVite: boolean },
  ) {
    const scripts = (pkg.scripts ??= {});
    const original = typeof scripts.dev === 'string' ? scripts.dev.trim() : '';
    let changed = false;

    if (options.hasNext) {
      const desired = 'next dev';
      if (original !== desired) {
        scripts.dev = desired;
        changed = true;
        logger.info('🛠 Normalized Next.js dev script');
      }
    } else if (options.hasVite) {
      const desired = 'vite';
      if (original !== desired) {
        scripts.dev = desired;
        changed = true;
        logger.info('🛠 Normalized Vite dev script');
      }
    }

    if (changed) {
      await this.#writePackageJson(wc, pkgRel, pkg);
    }

    return pkg;
  }

  #getSafePort(start = 5174, end = 5299) {
    if (this.#previewPort !== null) {
      return this.#previewPort;
    }

    let hostPort = Number.NaN;
    if (typeof window !== 'undefined' && window.location?.port) {
      const parsed = Number.parseInt(window.location.port, 10);
      if (!Number.isNaN(parsed)) {
        hostPort = parsed;
      }
    }

    const banned = new Set<number>();
    if (!Number.isNaN(hostPort)) {
      banned.add(hostPort);
    }
    // Don't ban common dev server ports - let the framework use its preferred port
    // Port 3000 is Next.js default, 8000 is common for Python, 8080 for Java
    // Only ban 5173 (Vite default) to avoid conflicts with this app
    banned.add(5173);

    for (let port = start; port <= end; port += 1) {
      if (banned.has(port)) {
        continue;
      }
      this.#previewPort = port;
      return port;
    }

    const fallback = Number.isNaN(hostPort) ? start : hostPort === start ? start + 1 : start;
    this.#previewPort = fallback;
    return fallback;
  }

  #normalizePreviewUrl(rawUrl: string) {
    try {
      const url = new URL(rawUrl);
      if (url.hostname === '0.0.0.0' || url.hostname === '127.0.0.1') {
        url.hostname = 'localhost';
      }
      if (!url.protocol) {
        url.protocol = 'http:';
      }
      return url.toString();
    } catch {
      if (/^https?:\/\//i.test(rawUrl)) {
        return rawUrl.replace('0.0.0.0', 'localhost');
      }
      return rawUrl;
    }
  }

  #appendProbeQuery(url: string) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('__bolt_probe', String(Date.now()));
      return parsed.toString();
    } catch {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}__bolt_probe=${Date.now()}`;
    }
  }

  async #waitForUrl(url: string) {
    if (typeof fetch !== 'function') {
      return false;
    }

    const target = this.#appendProbeQuery(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    try {
      await fetch(target, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return true;
    } catch {
      clearTimeout(timeout);
      return false;
    }
  }

  async #schedulePreviewReady(
    params: {
      port: number;
      url: string;
      context: 'dev' | 'static';
      rootAbs: string;
      fallbackMessage?: string;
      allowFallback?: boolean;
    },
    attempt = 0,
  ) {
    const { port, url, context, rootAbs, fallbackMessage, allowFallback = context === 'dev' } = params;

    if (this.#previewReadyPorts.has(port)) {
      this.#pendingPreviewChecks.delete(port);
      return;
    }

    if (attempt === 0) {
      if (this.#pendingPreviewChecks.has(port)) {
        return;
      }
      this.#pendingPreviewChecks.add(port);
    }

    const available = await this.#waitForUrl(url);
    if (available) {
      this.#pendingPreviewChecks.delete(port);
      this.#markPreviewReady(port, url, context);
      return;
    }

    // Give Next.js more time - it can be slow in WebContainer
    const maxAttempts = context === 'dev' ? 50 : 8;

    if (attempt >= maxAttempts - 1) {
      this.#pendingPreviewChecks.delete(port);

      if (context === 'dev' && allowFallback) {
        logger.error(`Dev server unreachable at ${url} after ${maxAttempts} attempts; falling back to static preview.`);
        // Don't kill the dev server - it might still start successfully
        // Just show static content for now
        await this.#startStaticPreview({
          rootAbs,
          reason: 'dev-unreachable',
          fallbackMessage: fallbackMessage ?? `Dev server at ${url} was unreachable after start. Serving the generated files statically.`,
          port,
        });
      } else {
        logger.error(`Preview URL ${url} unreachable after ${maxAttempts} attempts.`);
      }

      return;
    }

    setTimeout(() => {
      this.#schedulePreviewReady(params, attempt + 1).catch((error) => {
        logger.error('Preview readiness check failed:', error);
        this.#pendingPreviewChecks.delete(port);
      });
    }, context === 'dev' ? 1500 : 900);
  }

  #extractPreviewUrl(source: string, fallbackPort: number) {
    const fullUrlMatch = source.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)[^\s'"`]*/i);
    if (fullUrlMatch) {
      const port = Number.parseInt(fullUrlMatch[1], 10);
      const url = this.#normalizePreviewUrl(fullUrlMatch[0]);
      return { port, url };
    }

    const hostOnlyMatch = source.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/i);
    if (hostOnlyMatch) {
      const port = Number.parseInt(hostOnlyMatch[1], 10);
      return { port, url: this.#normalizePreviewUrl(`http://localhost:${port}`) };
    }

    return { port: fallbackPort, url: this.#normalizePreviewUrl(`http://localhost:${fallbackPort}`) };
  }

  #hasReadinessSignal(buffer: string, port: number) {
    const escapedPort = String(port).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const readinessPatterns = [
      /ready\b/i,
      /started server/i,
      /listening on/i,
      /compiled successfully/i,
      /dev server running/i,
      new RegExp(`https?:\\/\\/(?:localhost|0\\.0\\.0\\.0|127\\.0\\.0\\.1):${escapedPort}`, 'i'),
    ];

    return readinessPatterns.some((pattern) => pattern.test(buffer));
  }

  #markPreviewReady(port: number, url: string, context: 'dev' | 'static') {
    const normalizedUrl = this.#normalizePreviewUrl(url);
    if (this.#previewReadyPorts.has(port)) {
      return;
    }

    this.#previewReadyPorts.add(port);
    this.#currentPort = port;
    this.#previewPort = port;

    if (context === 'dev') {
      this.#installFailed = false;
      this.#installFailureSignature = null;
      this.#installFailureLogged = false;
    }

    const logMessage = context === 'dev'
      ? `🟢 Dev server indicates readiness on ${normalizedUrl}`
      : `🟢 Static preview ready on ${normalizedUrl}`;
    logger.info(logMessage);

    workbenchStore.previewsStore?.markPreviewReady(port, this.#withPreviewParams(normalizedUrl));
  }

  #withPreviewParams(url: string) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('embed', '1');
      parsed.searchParams.set('t', String(Date.now()));
      return parsed.toString();
    } catch {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}embed=1&t=${Date.now()}`;
    }
  }

  async #stopCurrentProcess(options?: { resetBootstrap?: boolean; resetPreview?: boolean }) {
    const { resetBootstrap = true, resetPreview = true } = options ?? {};

    if (!this.#devProcess) {
      if (resetBootstrap) {
        this.bootstrapAttempted = false;
      }
      if (resetPreview) {
        this.#previewReadyPorts.clear();
        this.#currentPort = null;
      }
      return;
    }

    const process = this.#devProcess;
    this.#devProcess = null;

    try {
      process.kill?.();
    } catch {
      // ignore if process already terminated
    }

    try {
      await process.exit;
    } catch {
      // ignore exit signal errors
    }

    this.#bootstrapMode = 'idle';
    if (resetBootstrap) {
      this.bootstrapAttempted = false;
    }
    if (resetPreview) {
      this.#previewReadyPorts.clear();
      this.#currentPort = null;
    }
  }

  async #ensureNextConfig(wc: WebContainer, projectRootAbs: string) {
    const rootRel = relToWorkdir(projectRootAbs);
    const configPath = nodePath.posix.join(rootRel, 'next.config.mjs');

    const configContent = `/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable SWC - use Babel instead (WebContainer doesn't support native addons)
  swcMinify: false,
  compiler: {
    // Disable SWC compiler
  },
  experimental: {
    // Use Babel for transforms
    forceSwcTransforms: false,
  },
  // Optimize for WebContainer environment
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      poll: 1000,
      aggregateTimeout: 300,
    };
    return config;
  },
};

export default nextConfig;
`;

    try {
      const existing = await wc.fs.readFile(configPath, 'utf-8').catch(() => null);
      
      // Only write if file doesn't exist or doesn't have SWC disabled
      if (!existing || !existing.includes('swcMinify: false')) {
        await wc.fs.writeFile(configPath, configContent);
        logger.info('✅ Created/updated next.config.mjs to disable SWC for WebContainer compatibility');
      }
    } catch (error) {
      logger.warn('Failed to create next.config.mjs:', error);
    }
  }

  async #ensurePostCssConfig(wc: WebContainer, projectRootAbs: string) {
    const rootRel = relToWorkdir(projectRootAbs);
    const configPath = nodePath.posix.join(rootRel, 'postcss.config.mjs');

    // Check package.json to determine if we need @tailwindcss/postcss (v4+) or tailwindcss (v3)
    const pkgRel = nodePath.posix.join(rootRel, 'package.json');
    let useTailwindV4 = false;
    
    try {
      const pkgContent = await wc.fs.readFile(pkgRel, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      const tailwindVersion = pkg.dependencies?.tailwindcss || pkg.devDependencies?.tailwindcss;
      
      // If tailwindcss version is 4.x or higher, or if @tailwindcss/postcss is installed, use v4 config
      if (tailwindVersion && (tailwindVersion.includes('^4') || tailwindVersion.includes('~4') || tailwindVersion.startsWith('4'))) {
        useTailwindV4 = true;
      } else if (pkg.dependencies?.['@tailwindcss/postcss'] || pkg.devDependencies?.['@tailwindcss/postcss']) {
        useTailwindV4 = true;
      }
    } catch {
      // Default to v3 if can't read package.json
      useTailwindV4 = false;
    }

    // Use ESM instead of CommonJS for WebContainer compatibility
    const configContent = useTailwindV4
      ? `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
`
      : `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`;

    try {
      const existing = await wc.fs.readFile(configPath, 'utf-8').catch(() => null);
      
      // Also check and remove old .js version
      const oldConfigPath = nodePath.posix.join(rootRel, 'postcss.config.js');
      const oldConfig = await wc.fs.readFile(oldConfigPath, 'utf-8').catch(() => null);
      
      if (oldConfig) {
        // Delete old CommonJS version
        await wc.fs.rm(oldConfigPath).catch(() => {});
        logger.info('🧹 Removed old postcss.config.js (CommonJS)');
      }
      
      // Always write if missing, or if config is malformed (doesn't match expected format)
      const shouldWrite = !existing || !existing.includes('plugins') || 
                         existing.includes('[') || // Array syntax - wrong!
                         existing.includes('require('); // CommonJS - wrong!
      
      if (shouldWrite) {
        await wc.fs.writeFile(configPath, configContent);
        logger.info('✅ Created/fixed postcss.config.mjs (ESM)');
      }
    } catch (error) {
      logger.warn('Failed to create postcss.config.mjs:', error);
    }
  }

  async #ensureTailwindConfig(wc: WebContainer, projectRootAbs: string) {
    const rootRel = relToWorkdir(projectRootAbs);
    const configPath = nodePath.posix.join(rootRel, 'tailwind.config.ts');

    const configContent = `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
`;

    try {
      const existing = await wc.fs.readFile(configPath, 'utf-8').catch(() => null);
      
      // Create if missing
      if (!existing) {
        await wc.fs.writeFile(configPath, configContent);
        logger.info('✅ Created tailwind.config.ts');
      }
    } catch (error) {
      logger.warn('Failed to create tailwind.config.ts:', error);
    }
  }

  async #addDependencyAndInstall(wc: WebContainer, projectRootAbs: string, packageName: string) {
    try {
      const rootRel = relToWorkdir(projectRootAbs);
      const pkgPath = nodePath.posix.join(rootRel, 'package.json');
      
      // Read package.json
      const pkgContent = await wc.fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      
      // Determine version (use 'latest' for simplicity)
      const version = 'latest';
      
      // Add to dependencies
      if (!pkg.dependencies) {
        pkg.dependencies = {};
      }
      
      if (!pkg.dependencies[packageName]) {
        pkg.dependencies[packageName] = `^${version}`;
        
        // Write updated package.json
        await wc.fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
        logger.info(`✅ Added ${packageName} to package.json`);
        
        // Kill dev server before installing
        if (this.#devProcess) {
          logger.info('🔄 Stopping dev server for dependency installation...');
          try {
            this.#devProcess.kill();
          } catch (e) {
            // Ignore kill errors
          }
          this.#devProcess = null;
        }
        
        // Install the package
        logger.info(`📦 Installing ${packageName}...`);
        const installProcess = await wc.spawn('/bin/jsh', ['-c', `cd ${rootRel} && pnpm add ${packageName}`]);
        
        const installOutput: string[] = [];
        const decoder = new TextDecoder();
        
        await installProcess.output.pipeTo(new WritableStream({
          write: (chunk) => {
            const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk);
            installOutput.push(text);
            workbenchStore.writeToTerminals(text);
          }
        })).catch(() => {});
        
        const exitCode = await installProcess.exit;
        
        if (exitCode === 0) {
          logger.info(`✅ Successfully installed ${packageName}`);
          logger.info('🔄 Restarting dev server...');
          
          // Restart dev server
          if (this.tryBootstrap) {
            await this.tryBootstrap();
          }
        } else {
          logger.error(`❌ Failed to install ${packageName} (exit code: ${exitCode})`);
        }
      }
    } catch (error) {
      logger.error(`Failed to add dependency ${packageName}:`, error);
    }
  }

  async #createMissingFile(wc: WebContainer, projectRootAbs: string, filePath: string, fileType: 'css' | 'component') {
    try {
      const rootRel = relToWorkdir(projectRootAbs);
      let targetPath: string;
      let content: string;
      
      if (fileType === 'css') {
        // Handle CSS files
        if (filePath.startsWith('./')) {
          targetPath = nodePath.posix.join(rootRel, filePath.substring(2));
        } else {
          targetPath = nodePath.posix.join(rootRel, filePath);
        }
        
        // Generate appropriate CSS content based on filename
        if (filePath.includes('globals') || filePath.includes('global')) {
          content = `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Global styles */
:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 214, 219, 220;
  --background-end-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 0, 0, 0;
    --background-end-rgb: 0, 0, 0;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
}
`;
        } else {
          content = `/* Auto-generated stylesheet */
/* Add your styles here */
`;
        }
      } else if (fileType === 'component') {
        // Handle React component files
        const componentPath = filePath.startsWith('@/') ? filePath.substring(2) : filePath;
        targetPath = nodePath.posix.join(rootRel, componentPath);
        
        // Extract component name from path
        const parts = componentPath.split('/');
        const fileName = parts[parts.length - 1];
        const componentName = fileName.replace(/\.(tsx?|jsx?)$/, '');
        
        // Determine if it's a .tsx or .ts file
        const isTsx = !fileName.endsWith('.ts') || fileName.endsWith('.tsx');
        
        if (isTsx) {
          content = `'use client';

import React from 'react';

interface ${componentName}Props {
  // Add props here
}

export default function ${componentName}({}: ${componentName}Props) {
  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold">${componentName}</h2>
      <p>This component was auto-generated. Please update the implementation.</p>
    </div>
  );
}
`;
        } else {
          content = `// Auto-generated module for ${componentName}
// Please update this implementation

export default {};
`;
        }
      } else {
        return;
      }
      
      // Create directory if needed
      const dir = nodePath.posix.dirname(targetPath);
      await wc.fs.mkdir(dir, { recursive: true }).catch(() => {});
      
      // Write the file
      await wc.fs.writeFile(targetPath, content);
      logger.info(`✅ Created missing ${fileType}: ${targetPath}`);
      
    } catch (error) {
      logger.error(`Failed to create missing ${fileType} file:`, error);
    }
  }

  #errorFixInProgress = new Set<string>();

  async #detectAndFixErrors(output: string, projectRootAbs: string) {
    try {
      const wc = await this.#webcontainer;
      const rootRel = relToWorkdir(projectRootAbs);

      // Pattern 1: Module not found errors - Can't resolve '@/components' - AUTO-CREATE
      const moduleNotFoundMatch = output.match(/Module not found: Can't resolve ['"]@\/([^'"]+)['"]/);
      if (moduleNotFoundMatch) {
        const missingPath = moduleNotFoundMatch[1];
        const fixKey = `missing-module-${missingPath}`;
        
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.error(`❌ Missing module detected: '@/${missingPath}'`);
          logger.info(`🔧 Auto-fix: Creating component file...`);
          
          // Auto-create the missing component file
          await this.#createMissingFile(wc, projectRootAbs, `@/${missingPath}`, 'component');
          
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 2: PostCSS config errors
      if (output.includes('PostCSS configuration') && output.includes('plugins')) {
        const fixKey = 'postcss-config';
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.info('🔧 Auto-fix: Detected PostCSS config error');
          await this.#ensurePostCssConfig(wc, projectRootAbs);
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 3: Missing tsconfig paths
      if (output.includes('Cannot find module') && output.includes('@/')) {
        const fixKey = 'tsconfig-paths';
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.info('🔧 Auto-fix: Detected missing TypeScript paths configuration');
          await this.#ensureTsConfig(wc, projectRootAbs);
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 4: TypeScript errors - Type 'X' is not assignable to type 'Y'
      const tsTypeError = output.match(/error TS\d+:.+?Type ['"](.+?)['"] is not assignable to type ['"](.+?)['"]/);
      if (tsTypeError) {
        const fixKey = `ts-type-error-${Date.now()}`;
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.warn(`⚠️ TypeScript type error detected: ${tsTypeError[1]} vs ${tsTypeError[2]}`);
          logger.info('💡 Suggestion: Check type definitions and ensure proper type casting');
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 5: Missing dependency in package.json - AUTO-INSTALL
      const missingDepMatch = output.match(/Module not found: Error: Can't resolve ['"]([^'"]+)['"]/);
      if (missingDepMatch) {
        const moduleName = missingDepMatch[1];
        // Only handle npm packages (not local paths like './' or '@/')
        if (moduleName && !moduleName.startsWith('.') && !moduleName.startsWith('@/') && !moduleName.endsWith('.css')) {
          const fixKey = `missing-dep-${moduleName}`;
          if (!this.#errorFixInProgress.has(fixKey)) {
            this.#errorFixInProgress.add(fixKey);
            logger.error(`❌ Missing dependency detected: ${moduleName}`);
            logger.info(`🔧 Auto-fix: Installing missing dependency...`);
            
            // Auto-install the missing dependency
            await this.#addDependencyAndInstall(wc, projectRootAbs, moduleName);
            
            setTimeout(() => this.#errorFixInProgress.delete(fixKey), 15000);
          }
        }
      }

      // Pattern 6: Tailwind CSS not configured
      if (output.includes('Tailwind CSS') && (output.includes('not configured') || output.includes('config file'))) {
        const fixKey = 'tailwind-config';
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.info('🔧 Auto-fix: Detected Tailwind CSS configuration issue');
          await this.#ensureTailwindConfig(wc, projectRootAbs);
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 7: Environment variable errors
      const envVarMatch = output.match(/process\.env\.(\w+) is not defined|Missing required environment variable[:\s]+['"]?(\w+)['"]?/);
      if (envVarMatch) {
        const envVar = envVarMatch[1] || envVarMatch[2];
        const fixKey = `env-var-${envVar}`;
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.warn(`⚠️ Environment variable missing: ${envVar}`);
          logger.info(`💡 Suggestion: Add ${envVar} to your .env.local file`);
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 8: Port already in use errors
      const portErrorMatch = output.match(/EADDRINUSE.*:(\d+)|Port (\d+) is already in use/);
      if (portErrorMatch) {
        const port = portErrorMatch[1] || portErrorMatch[2];
        const fixKey = `port-in-use-${port}`;
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.warn(`⚠️ Port ${port} is already in use`);
          logger.info('💡 Suggestion: Try a different port or kill the process using this port');
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 9: React hooks dependency warnings
      const hooksDepMatch = output.match(/React Hook \w+ has (a )?missing (dependency|dependencies):[^\n]+/);
      if (hooksDepMatch) {
        const fixKey = `hooks-dep-${Date.now()}`;
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.warn('⚠️ React Hook dependency issue detected');
          logger.info('💡 Suggestion: Add missing dependencies to useEffect/useCallback dependency array');
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 10: Syntax errors in JSX/TSX
      const jsxSyntaxMatch = output.match(/SyntaxError:.+?Unexpected token|Expected.*?but found/);
      if (jsxSyntaxMatch) {
        const fixKey = `jsx-syntax-${Date.now()}`;
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.error('❌ Syntax error detected in JSX/TSX');
          logger.info('💡 Suggestion: Check for unclosed tags, missing commas, or invalid syntax');
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 10a: Missing "use client" directive for client components
      if (output.includes("You're importing a component that needs") && 
          (output.includes("useState") || output.includes("useEffect") || output.includes("React Hook")) &&
          output.includes('mark the file (or its parent) with the `"use client"` directive')) {
        const fileMatch = output.match(/\[([^\]]+\.tsx?):(\d+):\d+\]/);
        const fixKey = `use-client-${fileMatch ? fileMatch[1] : 'unknown'}`;
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          const fileName = fileMatch ? fileMatch[1] : 'component file';
          logger.error(`❌ Missing "use client" directive in ${fileName}`);
          logger.info('💡 Suggestion: Add "use client" at the top of components that use React hooks (useState, useEffect, etc.)');
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 10b: Missing CSS file - AUTO-CREATE
      if (output.includes("Module not found: Can't resolve") && output.includes(".css'")) {
        const cssMatch = output.match(/Can't resolve ['"]([^'"]+\.css)['"]/);
        const fixKey = `missing-css-${cssMatch ? cssMatch[1] : 'unknown'}`;
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          const cssFile = cssMatch ? cssMatch[1] : null;
          if (cssFile) {
            logger.error(`❌ Missing CSS file: ${cssFile}`);
            logger.info(`🔧 Auto-fix: Creating ${cssFile}...`);
            
            // Auto-create the missing CSS file
            await this.#createMissingFile(wc, projectRootAbs, cssFile, 'css');
          }
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 10c: Metadata export with "use client"
      if (output.includes('You are attempting to export "metadata" from a component marked with "use client"')) {
        const fixKey = 'metadata-use-client';
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.error('❌ Cannot export metadata from client component');
          logger.info('💡 Suggestion: Remove "use client" from layout.tsx - layouts should be Server Components');
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 10f: Non-existent package (404 from npm registry)
      if (output.includes('ERR_PNPM_FETCH_404') || output.includes('is not in the npm registry')) {
        const packageMatch = output.match(/GET https:\/\/registry\.npmjs\.org\/([^:]+):|([^\s]+) is not in the npm registry/);
        if (packageMatch) {
          const packageName = (packageMatch[1] || packageMatch[2] || '').replace(/%2F/g, '/');
          const fixKey = `nonexistent-package-${packageName}`;
          if (!this.#errorFixInProgress.has(fixKey)) {
            this.#errorFixInProgress.add(fixKey);
            logger.error(`❌ Package does not exist in npm registry: ${packageName}`);

            const replacement = this.#getSafeReplacementPackage(packageName);
            if (replacement) {
              logger.info(`💡 Auto-fix: Replacing "${packageName}" with "${replacement.substitute.name}" (${replacement.reason})`);
            } else {
              logger.info(`💡 Auto-fix: Removing hallucinated package "${packageName}" from package.json`);
            }

            const rootRel = relToWorkdir(projectRootAbs);
            const pkgRel = nodePath.posix.join(rootRel, 'package.json');

            try {
              const pkgContent = await wc.fs.readFile(pkgRel, 'utf-8');
              const pkg = JSON.parse(pkgContent);

              let modified = false;
              const applyRemoval = (section: 'dependencies' | 'devDependencies') => {
                if (pkg[section] && pkg[section][packageName]) {
                  delete pkg[section][packageName];
                  modified = true;
                  logger.info(`✅ Removed ${packageName} from ${section}`);
                }
              };

              applyRemoval('dependencies');
              applyRemoval('devDependencies');

              if (replacement) {
                const { substitute, section } = replacement;
                if (!pkg[section]) {
                  pkg[section] = {};
                }
                pkg[section][substitute.name] = substitute.version;
                logger.info(`✅ Added ${section}.${substitute.name} = "${substitute.version}"`);
                modified = true;
              }

              if (modified) {
                await wc.fs.writeFile(pkgRel, JSON.stringify(pkg, null, 2));
                logger.info('🔄 Retrying installation with corrected package.json');

                this.#installFailed = false;
                this.#installFailureSignature = null;
                this.#installFailureLogged = false;
                this.#isInstalling = false;
                this.bootstrapAttempted = false;

                void this.tryBootstrap?.();
              }
            } catch (error) {
              logger.error('Failed to auto-fix non-existent package:', error);
            }

            setTimeout(() => this.#errorFixInProgress.delete(fixKey), 10000);
          }
        }
      }

      // Pattern 10d: Missing CSS files (./globals.css, ./styles.css, etc.)
      if (output.includes("Module not found: Can't resolve './") && 
          (output.includes(".css") || output.includes(".scss") || output.includes(".sass"))) {
        const cssMatch = output.match(/Can't resolve ['"](\.[^'"]+\.(?:css|scss|sass))['"]/);
        if (cssMatch) {
          const relativePath = cssMatch[1];
          const fixKey = `missing-css-${relativePath}`;
          if (!this.#errorFixInProgress.has(fixKey)) {
            this.#errorFixInProgress.add(fixKey);
            logger.error(`❌ Missing CSS file: ${relativePath}`);
            
            try {
              // Determine the file path based on the import location
              // For Next.js app/layout.tsx importing './globals.css', create app/globals.css
              let targetPath = relativePath.replace('./', '');
              
              // If importing from app/layout.tsx, ensure CSS is in app directory
              if (output.includes('app/layout.tsx')) {
                targetPath = nodePath.posix.join('app', targetPath.split('/').pop() || 'globals.css');
              }
              
              const fullPath = nodePath.posix.join(rootRel, targetPath);
              
              // Check if file exists
              const exists = await wc.fs.readFile(fullPath, 'utf-8').catch(() => null);
              
              if (!exists) {
                // Create basic CSS file with Tailwind directives
                const cssContent = targetPath.includes('global') 
                  ? `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Global styles */
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
`
                  : `/* Styles for ${targetPath} */\n`;
                
                const dir = nodePath.posix.dirname(fullPath);
                await wc.fs.mkdir(dir, { recursive: true }).catch(() => {});
                await wc.fs.writeFile(fullPath, cssContent);
                logger.info(`✅ Auto-fix: Created missing CSS file: ${targetPath}`);
                
                // Restart dev server to pick up new file
                logger.info('🔄 Restarting dev server to detect new CSS file');
                await this.#stopCurrentProcess({ resetBootstrap: false, resetPreview: false });
                this.bootstrapAttempted = false;
                void this.tryBootstrap?.();
              }
            } catch (error) {
              logger.error('Failed to auto-create CSS file:', error);
              logger.info(`💡 Suggestion: Create ${relativePath} file`);
            }
            
            setTimeout(() => this.#errorFixInProgress.delete(fixKey), 10000);
          }
        }
      }

      // Pattern 10e: Missing component files with @/ alias (@/components/NavBar)
      if (output.includes("Module not found: Can't resolve '@/components/") || 
          output.includes("Module not found: Can't resolve '@/app/")) {
        const componentMatch = output.match(/Can't resolve ['"]@\/([^'"]+)['"]/);
        if (componentMatch) {
          const importPath = componentMatch[1]; // e.g., "components/NavBar"
          const fixKey = `missing-component-alias-${importPath}`;
          if (!this.#errorFixInProgress.has(fixKey)) {
            this.#errorFixInProgress.add(fixKey);
            logger.error(`❌ Missing file: @/${importPath}`);
            
            try {
              // Determine file extension (.tsx, .ts, .jsx, .js)
              const possibleExtensions = ['.tsx', '.ts', '.jsx', '.js'];
              const basePath = nodePath.posix.join(rootRel, importPath);
              let found = false;
              
              // Check if any version of the file exists
              for (const ext of possibleExtensions) {
                const fullPath = basePath + ext;
                const exists = await wc.fs.readFile(fullPath, 'utf-8').catch(() => null);
                if (exists) {
                  found = true;
                  logger.info(`✅ File exists: ${importPath}${ext}`);
                  break;
                }
              }
              
              if (!found) {
                // Create placeholder component
                const componentName = importPath.split('/').pop() || 'Component';
                const filePath = basePath + '.tsx';
                const componentContent = `'use client';

export default function ${componentName}() {
  return (
    <div>
      <p>${componentName} - Component placeholder</p>
      <p style={{ color: 'orange' }}>⚠️ This is an auto-generated placeholder. The AI should replace this with actual implementation.</p>
    </div>
  );
}
`;
                
                const dir = nodePath.posix.dirname(filePath);
                await wc.fs.mkdir(dir, { recursive: true }).catch(() => {});
                await wc.fs.writeFile(filePath, componentContent);
                logger.info(`✅ Auto-fix: Created placeholder component: ${importPath}.tsx`);
                logger.info('💡 The AI should regenerate this component with proper implementation');
                
                // Restart dev server
                logger.info('🔄 Restarting dev server to detect new component');
                await this.#stopCurrentProcess({ resetBootstrap: false, resetPreview: false });
                this.bootstrapAttempted = false;
                void this.tryBootstrap?.();
              }
            } catch (error) {
              logger.error('Failed to auto-create component:', error);
              logger.info(`💡 Suggestion: Create ${importPath}.tsx file`);
            }
            
            setTimeout(() => this.#errorFixInProgress.delete(fixKey), 10000);
          }
        }
      }

      // Pattern 10f: Missing component files with relative imports (../components/)
      if (output.includes("Module not found: Can't resolve '../components/") ||
          output.includes("Module not found: Can't resolve './components/")) {
        const componentMatch = output.match(/Can't resolve ['"](\.\.[\/\\]components[\/\\][^'"]+|\.\/components[\/\\][^'"]+)['"]/);
        if (componentMatch) {
          const relativePath = componentMatch[1];
          const fixKey = `missing-component-rel-${relativePath}`;
          if (!this.#errorFixInProgress.has(fixKey)) {
            this.#errorFixInProgress.add(fixKey);
            const component = relativePath.split(/[\/\\]/).pop() || 'component';
            logger.error(`❌ Missing component: ${component} (${relativePath})`);
            logger.info(`💡 Suggestion: Create components/${component}.tsx file`);
            setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
          }
        }
      }

      // Pattern 10g: Missing package dependency
      if (output.includes("Module not found: Can't resolve '@") && 
          !output.includes("@/") && // Exclude path aliases
          !output.includes(".css")) {
        const pkgMatch = output.match(/Can't resolve ['"](@[^/]+\/[^'"]+|@[^'"]+)['"]/);
        if (pkgMatch) {
          const pkg = pkgMatch[1];
          const fixKey = `missing-pkg-${pkg}`;
          if (!this.#errorFixInProgress.has(fixKey)) {
            this.#errorFixInProgress.add(fixKey);
            logger.error(`❌ Missing package: ${pkg}`);
            logger.info(`💡 Suggestion: Add "${pkg}": "latest" to package.json dependencies`);
            setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
          }
        }
      }

      // Pattern 11: CommonJS module errors in WebContainer
      if (output.includes("Can't find variable: module") || output.includes("module is not defined") || 
          output.includes("require is not defined") || output.includes("exports is not defined")) {
        const fixKey = 'commonjs-esm';
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.error('❌ CommonJS syntax detected (module.exports, require) - not supported in WebContainer');
          logger.info('🔧 Auto-fix: Converting to ESM (import/export)');
          
          // Auto-fix PostCSS config if it exists as .js
          await this.#ensurePostCssConfig(wc, projectRootAbs);
          
          logger.info('💡 Suggestion: Use ESM syntax (import/export) instead of CommonJS (require/module.exports)');
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 5000);
        }
      }

      // Pattern 12: Malformed PostCSS Configuration
      if (output.includes("Malformed PostCSS Configuration") || 
          output.includes("A PostCSS Plugin was passed as a function using require()") ||
          output.includes("A PostCSS Plugin was passed as an array") ||
          output.includes("but it must be provided as a string") ||
          output.includes("did not provide its configuration")) {
        const fixKey = 'postcss-malformed';
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.error('❌ Malformed PostCSS configuration detected');
          logger.info('🔧 Auto-fix: Regenerating PostCSS config with correct format');
          
          // Force regenerate PostCSS config
          await this.#ensurePostCssConfig(wc, projectRootAbs);
          
          // Restart dev server to pick up config changes
          logger.info('🔄 Restarting dev server to apply PostCSS config fix');
          await this.#stopCurrentProcess({ resetBootstrap: false, resetPreview: false });
          this.bootstrapAttempted = false;
          void this.tryBootstrap?.();
          
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 10000);
        }
      }

      // Pattern 13: Tailwind CSS v4 PostCSS plugin error
      if (output.includes("It looks like you're trying to use `tailwindcss` directly as a PostCSS plugin") ||
          output.includes("The PostCSS plugin has moved to a separate package") ||
          output.includes("install `@tailwindcss/postcss`")) {
        const fixKey = 'tailwind-postcss-v4';
        if (!this.#errorFixInProgress.has(fixKey)) {
          this.#errorFixInProgress.add(fixKey);
          logger.error('❌ Tailwind CSS v4 PostCSS plugin error detected');
          logger.info('🔧 Auto-fix: Installing @tailwindcss/postcss and updating PostCSS config');
          
          // Install @tailwindcss/postcss package
          const rootRel = relToWorkdir(projectRootAbs);
          const pkgRel = nodePath.posix.join(rootRel, 'package.json');
          
          try {
            const pkgContent = await wc.fs.readFile(pkgRel, 'utf-8');
            const pkg = JSON.parse(pkgContent);
            
            // Add @tailwindcss/postcss to devDependencies
            if (!pkg.devDependencies) {
              pkg.devDependencies = {};
            }
            pkg.devDependencies['@tailwindcss/postcss'] = 'latest';
            
            // Write updated package.json
            await wc.fs.writeFile(pkgRel, JSON.stringify(pkg, null, 2));
            logger.info('✅ Added @tailwindcss/postcss to package.json');
            
            // Update PostCSS config
            await this.#ensurePostCssConfig(wc, projectRootAbs);
            
            // Kill current dev server
            logger.info('🔄 Stopping dev server and installing new package');
            await this.#stopCurrentProcess({ resetBootstrap: true, resetPreview: false });
            
            // Run pnpm install to actually install the package
            logger.info('📦 Installing @tailwindcss/postcss...');
            const installProcess = await wc.spawn('/bin/jsh', ['-c', `cd ${projectRootAbs} && pnpm install @tailwindcss/postcss`], {
              env: { npm_config_yes: 'true', CI: 'true' }
            });
            
            const decoder = new TextDecoder();
            let installBuffer = '';
            
            await installProcess.output.pipeTo(
              new WritableStream({
                write: (data) => {
                  const chunk = typeof data === 'string' ? data : decoder.decode(data as Uint8Array, { stream: true });
                  installBuffer += chunk;
                  workbenchStore.writeToTerminals(chunk);
                },
                close: () => {
                  const remaining = decoder.decode();
                  if (remaining) {
                    installBuffer += remaining;
                    workbenchStore.writeToTerminals(remaining);
                  }
                }
              })
            ).catch(() => {});
            
            const installExitCode = await installProcess.exit;
            
            if (installExitCode === 0) {
              logger.info('✅ @tailwindcss/postcss installed successfully');
              
              // Now trigger full bootstrap to restart dev server
              this.bootstrapAttempted = false;
              this.#isInstalling = false;
              void this.tryBootstrap?.();
            } else {
              logger.error(`❌ Failed to install @tailwindcss/postcss (exit code ${installExitCode})`);
            }
          } catch (error) {
            logger.error('Failed to auto-fix Tailwind PostCSS plugin:', error);
          }
          
          setTimeout(() => this.#errorFixInProgress.delete(fixKey), 15000);
        }
      }
    } catch (error) {
      // Silent fail - don't break the dev server watcher
      logger.debug('Error in auto-fix detection:', error);
    }
  }

  async #ensureTsConfig(wc: WebContainer, projectRootAbs: string) {
    const rootRel = relToWorkdir(projectRootAbs);
    const configPath = nodePath.posix.join(rootRel, 'tsconfig.json');

    try {
      const existing = await wc.fs.readFile(configPath, 'utf-8').catch(() => null);
      
      if (existing) {
        const config = JSON.parse(existing);
        
        // Ensure paths are configured for @/* imports
        if (!config.compilerOptions) {
          config.compilerOptions = {};
        }
        
        if (!config.compilerOptions.paths || !config.compilerOptions.paths['@/*']) {
          config.compilerOptions.baseUrl = '.';
          config.compilerOptions.paths = {
            '@/*': ['./*'],
            ...(config.compilerOptions.paths || {}),
          };
          
          await wc.fs.writeFile(configPath, JSON.stringify(config, null, 2));
          logger.info('✅ Updated tsconfig.json with path mappings');
        }
      } else {
        // Create default tsconfig.json for Next.js
        const defaultConfig = {
          compilerOptions: {
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            baseUrl: '.',
            paths: {
              '@/*': ['./*'],
            },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        };
        
        await wc.fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
        logger.info('✅ Created tsconfig.json with path mappings');
      }
    } catch (error) {
      logger.warn('Failed to update tsconfig.json:', error);
    }
  }

  async #ensureStaticServerScript(wc: WebContainer, rootAbs: string) {
    const boltDirAbs = nodePath.posix.join(rootAbs, '.bolt');
    const boltDirRel = relToWorkdir(boltDirAbs);
    const scriptRel = nodePath.posix.join(boltDirRel, 'static-server.cjs');

    const scriptContent = `"use strict";

const http = require('http');
const fs = require('fs');
const path = require('path');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const staticRoot = process.env.STATIC_ROOT || process.cwd();
const fallbackFile = process.env.FALLBACK_FILE;
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';

function resolvePath(urlPath) {
  let normalized = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (!normalized || normalized === '/') {
    normalized = 'index.html';
  } else {
    normalized = normalized.replace(/^\/+/, '');
  }
  return path.join(staticRoot, normalized);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (fallbackFile && fallbackFile !== filePath) {
        return sendFallback(res);
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not found');
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.end(data);
  });
}

function sendFallback(res) {
  if (!fallbackFile) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
    return;
  }

  const target = path.isAbsolute(fallbackFile)
    ? fallbackFile
    : path.join(staticRoot, fallbackFile);

  fs.readFile(target, (err, data) => {
    if (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Preview fallback failed');
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const targetPath = resolvePath(req.url || '/');

  if (!targetPath.startsWith(staticRoot)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Forbidden');
    return;
  }

  fs.stat(targetPath, (err, stats) => {
    if (err) {
      if (fallbackFile) {
        return sendFallback(res);
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not found');
      return;
    }

    if (stats.isDirectory()) {
      const indexPath = path.join(targetPath, 'index.html');
      return sendFile(res, indexPath);
    }

    sendFile(res, targetPath);
  });
});

server.listen(port, host, () => {
  console.log('STATIC_SERVER_READY http://localhost:' + port);
});
`;

    await wc.fs.mkdir(boltDirRel).catch(() => {});
    const current = await wc.fs.readFile(scriptRel, 'utf-8').catch(() => null);
    if (current !== scriptContent) {
      await wc.fs.writeFile(scriptRel, scriptContent);
    }
  }

  async #ensureStaticIndex(wc: WebContainer, rootAbs: string) {
    const indexAbs = nodePath.posix.join(rootAbs, 'index.html');
    const indexRel = relToWorkdir(indexAbs);

    try {
      const existing = await wc.fs.readFile(indexRel, 'utf-8');
      if (existing && existing.trim().length > 0) {
        return;
      }
    } catch {
      // create below
    }

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview Ready</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
      main { max-width: 640px; text-align: center; }
      h1 { font-size: 2rem; margin-bottom: 1rem; }
      p { margin: 0.5rem 0; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>Your preview is ready</h1>
      <p>This static page was generated automatically because the project does not yet include its own <code>index.html</code>.</p>
      <p>Once the agent creates project files, this preview will update automatically.</p>
    </main>
  </body>
</html>`;

    const indexDirRel = nodePath.posix.dirname(indexRel);
    if (indexDirRel && indexDirRel !== '.' && indexDirRel !== '/') {
      await wc.fs.mkdir(indexDirRel, { recursive: true }).catch(() => {});
    }
    await wc.fs.writeFile(indexRel, html);
  }

  async #ensureFallbackPage(wc: WebContainer, rootAbs: string, message: string) {
    const boltDirAbs = nodePath.posix.join(rootAbs, '.bolt');
    const boltDirRel = relToWorkdir(boltDirAbs);
    const fallbackRel = nodePath.posix.join(boltDirRel, 'install-error.html');

    const sanitizedMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;');

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview Fallback</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #0f172a; color: #e2e8f0; }
      pre { background: rgba(15, 23, 42, 0.6); padding: 1.5rem; border-radius: 0.75rem; overflow-x: auto; }
      h1 { font-size: 1.75rem; margin-bottom: 1rem; }
      a { color: #38bdf8; }
    </style>
  </head>
  <body>
    <h1>Preview fallback active</h1>
    <p>The agent could not start the requested dev server. Showing the generated files instead.</p>
    <pre>${sanitizedMessage}</pre>
  </body>
</html>`;

    await wc.fs.mkdir(boltDirRel).catch(() => {});
    await wc.fs.writeFile(fallbackRel, html);

    return '.bolt/install-error.html';
  }

  async #startStaticPreview(options: {
    rootAbs: string;
    reason: 'no-package' | 'install-failed' | 'no-dev-command' | 'dev-unreachable';
    fallbackMessage?: string;
    port?: number;
    pkgSignature?: string;
  }) {
    const { rootAbs, reason, fallbackMessage, port: requestedPort, pkgSignature } = options;

    if (this.#bootstrapMode === 'static' && this.#devProcess) {
      logger.debug('Static preview already running; skipping restart');
      return;
    }

    const wc = await this.#webcontainer;
    const port = requestedPort ?? this.#getSafePort();
    this.#previewPort = port;

    if (reason === 'install-failed') {
      this.#installFailed = true;
      if (pkgSignature) {
        this.#installFailureSignature = pkgSignature;
      }
      this.#installFailureLogged = false;
      // Stop dev server since install failed
      await this.#stopCurrentProcess({ resetBootstrap: true, resetPreview: true });
    } else if (reason === 'dev-unreachable') {
      this.#installFailed = false;
      this.#installFailureSignature = null;
      this.#installFailureLogged = false;
      // DON'T stop dev server - it might still be starting
      // We're just showing a fallback preview while waiting
      logger.info('Showing static fallback while dev server initializes');
      return; // Exit early without starting static server
    } else {
      this.#installFailed = false;
      this.#installFailureSignature = null;
      this.#installFailureLogged = false;
      await this.#stopCurrentProcess({ resetBootstrap: true, resetPreview: true });
    }
    this.#previewReadyPorts.clear();

    this.#projectRoot = relToWorkdir(rootAbs) === '.' ? '/' : `/${relToWorkdir(rootAbs)}`;
    this.#currentPort = port;

    await this.#ensureStaticServerScript(wc, rootAbs);
    await this.#ensureStaticIndex(wc, rootAbs);

    let fallbackFile: string | undefined;
    if (fallbackMessage) {
      fallbackFile = await this.#ensureFallbackPage(wc, rootAbs, fallbackMessage);
    }

    const command = `cd ${rootAbs} && node ./.bolt/static-server.cjs`;
    const env: Record<string, string> = {
      HOST: '0.0.0.0',
      PORT: String(port),
      STATIC_ROOT: rootAbs,
    };

    if (fallbackFile) {
      env.FALLBACK_FILE = fallbackFile;
    }

    this.#bootstrapMode = 'static';
    this.bootstrapAttempted = true;

    let reasonMessage = 'ℹ️ Starting static preview for generated files';
    if (reason === 'install-failed') {
      reasonMessage = '⚠️ Falling back to static preview after install failure';
    } else if (reason === 'no-dev-command') {
      reasonMessage = 'ℹ️ Dev command unavailable; serving generated files statically';
    }

    logger.info(reasonMessage);

    const process = await wc.spawn('/bin/jsh', ['-c', command], { env });
    this.#devProcess = process;

    const decoder = new TextDecoder();
    let buffer = '';

    process.output
      .pipeTo(
        new WritableStream({
          write: (data) => {
            const chunk = typeof data === 'string'
              ? data
              : decoder.decode(data as Uint8Array, { stream: true });
            buffer = `${buffer}${chunk}`.slice(-4000);
            workbenchStore.writeToTerminals(chunk);

            if (buffer.includes('STATIC_SERVER_READY')) {
              const { port: readyPort, url } = this.#extractPreviewUrl(buffer, port);
              void this.#schedulePreviewReady({
                port: readyPort,
                url,
                context: 'static',
                rootAbs,
                allowFallback: false,
              });
            }
          },
          close: () => {
            const remaining = decoder.decode();
            if (remaining) {
              buffer = `${buffer}${remaining}`.slice(-4000);
              workbenchStore.writeToTerminals(remaining);
              if (buffer.includes('STATIC_SERVER_READY')) {
                const { port: readyPort, url } = this.#extractPreviewUrl(buffer, port);
                void this.#schedulePreviewReady({
                  port: readyPort,
                  url,
                  context: 'static',
                  rootAbs,
                  allowFallback: false,
                });
              }
            }
          },
        }),
      )
      .catch(() => {});

    process.exit.finally(() => {
      if (this.#devProcess === process) {
        this.#devProcess = null;
        this.#bootstrapMode = 'idle';
        this.bootstrapAttempted = false;
        this.#currentPort = null;
        this.#previewReadyPorts.clear();
      }
    });
  }

  async #ensureScaffolding(pkg: unknown, projectRootAbs: string) {
    try {
      const dependencies = { ...((pkg as any)?.dependencies ?? {}), ...((pkg as any)?.devDependencies ?? {}) } as Record<string, string>;
      const hasNext = typeof dependencies['next'] === 'string';
      const hasVite = typeof dependencies['vite'] === 'string';

      if (!hasNext && !hasVite) {
        return;
      }

      const wc = await this.#webcontainer;

      // Ensure Next.js config disables SWC (not supported in WebContainer)
      if (hasNext) {
        await this.#ensureNextConfig(wc, projectRootAbs);
        await this.#ensurePostCssConfig(wc, projectRootAbs);
        await this.#ensureTailwindConfig(wc, projectRootAbs);
      }

      if (hasNext) {
        const appDirRel = relToWorkdir(nodePath.posix.join(projectRootAbs, 'app'));
        const pageFileRel = nodePath.posix.join(appDirRel, 'page.tsx');
        let needsWrite = false;
        try {
          const content = await wc.fs.readFile(pageFileRel, 'utf-8');
          needsWrite = !content.trim();
        } catch {
          needsWrite = true;
          await wc.fs.mkdir(appDirRel).catch(() => {});
        }

        if (needsWrite) {
          const scaffold = `export default function Page() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Hello from Next.js</h1>
      <p>The preview is ready!</p>
    </main>
  );
}
`;
          await wc.fs.writeFile(pageFileRel, scaffold);
        }
      }

      if (hasVite) {
        const rootRel = relToWorkdir(projectRootAbs);
        const indexHtmlRel = nodePath.posix.join(rootRel, 'index.html');
        const mainRel = nodePath.posix.join(rootRel, 'src/main.tsx');
        const appRel = nodePath.posix.join(rootRel, 'src/App.tsx');

        const ensureFile = async (rel: string, defaultContent: string) => {
          try {
            const existing = await wc.fs.readFile(rel, 'utf-8');
            if (!existing.trim()) {
              await wc.fs.writeFile(rel, defaultContent);
            }
          } catch {
            const dir = nodePath.posix.dirname(rel);
            await wc.fs.mkdir(dir, { recursive: true }).catch(() => {});
            await wc.fs.writeFile(rel, defaultContent);
          }
        };

        await ensureFile(indexHtmlRel, `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);

        await ensureFile(appRel, `import { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Hello from Vite + React</h1>
      <p>The preview is ready!</p>
      <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
    </main>
  );
}
`);

        await ensureFile(mainRel, `import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`);
      }
    } catch (error) {
      logger.warn('Failed to ensure scaffolding:', error);
    }
  }

  async #ensureDependenciesInstalled(
    wc: WebContainer,
    projectRootAbs: string,
    projectRootRel: string,
    pkgRel: string,
    pkg: any,
    hasNodeModules: boolean,
  ): Promise<{ success: boolean; pkg: any; failureTail?: string[] }> {
    if (hasNodeModules) {
      return { success: true, pkg, failureTail: [] };
    }

    if (this.#isInstalling) {
      logger.info('⬇️ Waiting for ongoing dependency installation to finish');
      while (this.#isInstalling) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const refreshed = JSON.parse(await wc.fs.readFile(pkgRel, 'utf-8'));
      return { success: true, pkg: refreshed, failureTail: [] };
    }

    this.#isInstalling = true;

    const nodeModulesRel = projectRootRel === '.' ? 'node_modules' : nodePath.posix.join(projectRootRel, 'node_modules');
    const baseEnv: Record<string, string> = {
      npm_config_yes: 'true',
      CI: 'true',
    };

    try {
      await this.#removeLockfile(wc, projectRootRel, 'package-lock.json');
      await this.#removeLockfile(wc, projectRootRel, 'yarn.lock');

      type InstallStep = {
        label: string;
        description: string;
        env?: Record<string, string>;
        prepare?: () => Promise<void>;
      };

      const steps: InstallStep[] = [
        { label: 'A', description: 'Clean install' },
        {
          label: 'B',
          description: 'Retry without lifecycle scripts',
          env: { npm_config_ignore_scripts: 'true' },
        },
        {
          label: 'C',
          description: 'Relax engines and peer deps',
          env: { PNPM_STRICT_PEER_DEPENDENCIES: 'false' },
          prepare: async () => {
            if (pkg?.engines) {
              delete pkg.engines;
              await this.#writePackageJson(wc, pkgRel, pkg);
              logger.info('🛠 Removed package.json engines field for compatibility');
            }
          },
        },
        {
          label: 'D',
          description: 'Autofix framework dependencies',
          env: { PNPM_STRICT_PEER_DEPENDENCIES: 'false' },
          prepare: async () => {
            const { pkg: patchedPkg, changes } = await this.#applyAutofixDependencies(wc, projectRootAbs, pkgRel, pkg);
            pkg = patchedPkg;
            if (changes.length) {
              await this.#recordAutofix(wc, projectRootAbs, changes);
              logger.info('🛠 Applied dependency autofixes');
            }
          },
        },
      ];

      let lastFailureTail: string[] = [];
      let failedAttempts = 0;

      for (const step of steps) {
        if (await this.#directoryExists(wc, nodeModulesRel)) {
          const refreshed = JSON.parse(await wc.fs.readFile(pkgRel, 'utf-8'));
          return { success: true, pkg: refreshed, failureTail: [] };
        }

        if (step.prepare) {
          await step.prepare();
        }

        const { exitCode, buffer, timedOut } = await this.#runPnpmInstall(
          wc,
          projectRootAbs,
          { ...baseEnv, ...(step.env ?? {}) },
          `Step ${step.label}: ${step.description}`);

        if (exitCode === 0) {
          logger.info(`✅ pnpm install succeeded (${step.description})`);
          const refreshed = JSON.parse(await wc.fs.readFile(pkgRel, 'utf-8'));
          this.#installFailed = false;
          this.#installFailureSignature = null;
          this.#installFailureLogged = false;
          return { success: true, pkg: refreshed, failureTail: [] };
        }

        lastFailureTail = buffer.tail();
        failedAttempts += 1;
        this.#logInstallFailure(step.label, lastFailureTail);

        if (timedOut || failedAttempts >= 2) {
          break;
        }

        // Move to next step for retry
      }

      logger.error('🛑 pnpm install failed after automated retries; see recent output for details.');
      if (lastFailureTail.length) {
        this.#logInstallFailure('final', lastFailureTail);
      }
      return { success: false, pkg, failureTail: lastFailureTail };
    } finally {
      this.#isInstalling = false;
    }
  }

  async #runPnpmInstall(
    wc: WebContainer,
    projectRootAbs: string,
    env: Record<string, string>,
    label: string,
  ): Promise<{ exitCode: number; buffer: InstallLogBuffer; timedOut: boolean }> {
    const buffer = new InstallLogBuffer();
    const decoder = new TextDecoder();
    let timedOut = false;
    let watchdog: number | null = null;

    logger.info(`⬇️ Installing dependencies (${label})`);
    logger.info(`📂 Working directory: ${projectRootAbs}`);
    logger.info(`🔧 Spawning: cd ${projectRootAbs} && pnpm install`);

    const process = await wc.spawn('/bin/jsh', ['-c', `cd ${projectRootAbs} && pnpm install`], { env });
    
    logger.info(`✅ pnpm install process spawned, waiting for output...`);

    const resetWatchdog = () => {
      if (watchdog) {
        clearTimeout(watchdog);
      }
      watchdog = setTimeout(() => {
        timedOut = true;
        logger.warn(`⌛ pnpm install (${label}) timed out after ${INSTALL_WATCHDOG_MS / 1000}s, terminating process`);
        try {
          process.kill?.();
        } catch {
          // ignore
        }
      }, INSTALL_WATCHDOG_MS) as unknown as number;
    };

    resetWatchdog();

    let outputReceived = false;
    const writer = new WritableStream({
      write: (data: any) => {
        if (!outputReceived) {
          outputReceived = true;
          logger.info('📥 First pnpm install output received');
        }
        const text = typeof data === 'string' ? data : decoder.decode(data as Uint8Array, { stream: true });
        buffer.append(text);
        workbenchStore.writeToTerminals(text);
        resetWatchdog();
      },
      close: () => {
        const remaining = decoder.decode();
        if (remaining) {
          buffer.append(remaining);
        }
        buffer.flush();
        if (watchdog) {
          clearTimeout(watchdog);
        }
        logger.info('📤 pnpm install output stream closed');
      },
    });

    process.output.pipeTo(writer).catch((pipeError) => {
      logger.error(`❌ Output pipe error:`, pipeError);
    });

    logger.info(`⏳ Waiting for pnpm install to complete...`);
    
    // Add a separate timeout in case the process hangs
    const processTimeout = setTimeout(() => {
      if (!outputReceived) {
        logger.error('⚠️ No output received from pnpm install after 10s - process may be hung');
      }
    }, 10000);
    
    const exitCode = await process.exit;
    clearTimeout(processTimeout);
    buffer.flush();
    if (watchdog) {
      clearTimeout(watchdog);
    }
    logger.info(`✅ pnpm install (${label}) exited with code ${exitCode}`);
    return { exitCode, buffer, timedOut };
  }

  #logInstallFailure(stepLabel: string, tail: string[]) {
    if (!tail.length) {
      logger.error(`pnpm install failed during step ${stepLabel}, but no output was captured.`);
      return;
    }

    logger.error(`pnpm install failed during step ${stepLabel}. Recent output:`);
    tail.slice(-INSTALL_LOG_LINE_LIMIT).forEach((line) => {
      logger.error(`[pnpm] ${line}`);
    });
  }

  async #removeLockfile(wc: WebContainer, projectRootRel: string, fileName: string) {
    const relPath = projectRootRel === '.' ? fileName : nodePath.posix.join(projectRootRel, fileName);
    try {
      await wc.fs.rm(relPath);
      logger.info(`🧹 Removed ${fileName}`);
    } catch {
      // ignore missing lockfiles
    }
  }

  async #writePackageJson(wc: WebContainer, pkgRel: string, pkg: any) {
    await wc.fs.writeFile(pkgRel, JSON.stringify(pkg, null, 2));
  }

  async #recordAutofix(wc: WebContainer, projectRootAbs: string, changes: string[]) {
    if (!changes.length) {
      return;
    }

    const boltDirAbs = nodePath.posix.join(projectRootAbs, '.bolt');
    const boltDirRel = relToWorkdir(boltDirAbs);
    await wc.fs.mkdir(boltDirRel).catch(() => {});

    const autofixRel = nodePath.posix.join(boltDirRel, 'autofixes.json');
    let existing: any = [];
    try {
      const content = await wc.fs.readFile(autofixRel, 'utf-8');
      existing = JSON.parse(content);
      if (!Array.isArray(existing)) {
        existing = [];
      }
    } catch {
      existing = [];
    }

    existing.push({
      appliedAt: new Date().toISOString(),
      changes,
    });

    await wc.fs.writeFile(autofixRel, JSON.stringify(existing, null, 2));
  }

  async #applyAutofixDependencies(
    wc: WebContainer,
    projectRootAbs: string,
    pkgRel: string,
    pkg: any,
  ): Promise<{ pkg: any; changes: string[] }> {
    const changes: string[] = [];

    const dependencies = (pkg.dependencies ??= {});
    const devDependencies = (pkg.devDependencies ??= {});

    const hasNext = typeof dependencies['next'] === 'string' || typeof devDependencies['next'] === 'string';
    const hasVite = typeof dependencies['vite'] === 'string' || typeof devDependencies['vite'] === 'string';

    const sanitizeMap = (section: 'dependencies' | 'devDependencies', map: Record<string, string>) => {
      for (const [name, value] of Object.entries(map)) {
        if (!this.#isSemverRange(value)) {
          map[name] = 'latest';
          changes.push(`Set ${section}.${name} to "latest"`);
        }
      }
    };

    sanitizeMap('dependencies', dependencies);
    sanitizeMap('devDependencies', devDependencies);

    const ensureDependency = (section: 'dependencies' | 'devDependencies', name: string, version?: string) => {
      const target = section === 'dependencies' ? dependencies : devDependencies;
      if (!target[name]) {
        target[name] = version || 'latest';
        changes.push(`Added ${section}.${name} = "${version || 'latest'}"`);
      }
    };

    if (hasNext) {
      ensureDependency('dependencies', 'next');
      ensureDependency('dependencies', 'react', '^18.3.1');
      ensureDependency('dependencies', 'react-dom', '^18.3.1');
      ensureDependency('devDependencies', 'typescript', '^5');
      ensureDependency('devDependencies', '@types/react', '^18');
      ensureDependency('devDependencies', '@types/react-dom', '^18');
      ensureDependency('devDependencies', '@types/node', '^20');
    }

    if (hasVite) {
      ensureDependency('devDependencies', 'vite');
      ensureDependency('dependencies', 'react', '^18.3.1');
      ensureDependency('dependencies', 'react-dom', '^18.3.1');
      ensureDependency('devDependencies', '@types/react', '^18');
      ensureDependency('devDependencies', '@types/react-dom', '^18');
      ensureDependency('devDependencies', 'typescript', '^5');
    }

    if (changes.length) {
      await this.#writePackageJson(wc, pkgRel, pkg);
      // Clear install failure since we've modified the package.json
      this.#installFailed = false;
      this.#installFailureSignature = null;
      this.#installFailureLogged = false;
    }

    return { pkg, changes };
  }

  #isSemverRange(value: string | undefined): boolean {
    if (!value) return false;
    if (value === 'latest') return true;
    if (/^(workspace:|file:|link:|git\+|github:)/i.test(value)) {
      return false;
    }
    return /^(?:[~^]|>=?|<=?|=)?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
  }

  async #directoryExists(wc: WebContainer, relPath: string) {
    try {
      await wc.fs.readdir(relPath);
      return true;
    } catch {
      return false;
    }
  }

  #missingPackageMap: Record<string, { name: string; version: string; section: 'dependencies' | 'devDependencies'; reason: string }> = {
    '@types/react-hook-form': {
      name: 'react-hook-form',
      version: 'latest',
      section: 'dependencies',
      reason: '@types/react-hook-form does not exist; react-hook-form ships its own types.',
    },
    '@types/lucide-react': {
      name: 'lucide-react',
      version: 'latest',
      section: 'dependencies',
      reason: '@types/lucide-react does not exist; lucide-react ships its own types.',
    },
    '@types/zod': {
      name: 'zod',
      version: 'latest',
      section: 'dependencies',
      reason: '@types/zod does not exist; zod ships its own types.',
    },
    '@types/zustand': {
      name: 'zustand',
      version: 'latest',
      section: 'dependencies',
      reason: '@types/zustand does not exist; zustand ships its own types.',
    },
  };

  #getSafeReplacementPackage(pkg: string) {
    const entry = this.#missingPackageMap[pkg];
    if (entry) {
      return { substitute: { name: entry.name, version: entry.version }, section: entry.section, reason: entry.reason };
    }
    const replacements: Record<string, { name: string; version: string; section: 'dependencies' | 'devDependencies'; reason: string }> = {
      '@houzactions/Toast': {
        name: 'react-hot-toast',
        version: 'latest',
        section: 'dependencies',
        reason: '@houzactions/Toast does not exist. react-hot-toast is a reliable toast notification library.',
      },
    };
    const match = replacements[pkg];
    if (match) {
      return { substitute: { name: match.name, version: match.version }, section: match.section, reason: match.reason };
    }
    return null;
  }
}

function isBinaryFile(buffer: Uint8Array | undefined) {
  if (buffer === undefined) {
    return false;
  }

  // For very large files, only check a small sample to avoid memory issues
  const sampleSize = Math.min(buffer.byteLength, 1024); // Check only first 1KB
  const sample = buffer.slice(0, sampleSize);

  return getEncoding(convertToBuffer(sample), { chunkLength: 100 }) === 'binary';
}

/**
 * Converts a `Uint8Array` into a Node.js `Buffer` by copying the prototype.
 * The goal is to  avoid expensive copies. It does create a new typed array
 * but that's generally cheap as long as it uses the same underlying
 * array buffer.
 */
function convertToBuffer(view: Uint8Array): Buffer {
  const buffer = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

  Object.setPrototypeOf(buffer, Buffer.prototype);

  return buffer as Buffer;
}
