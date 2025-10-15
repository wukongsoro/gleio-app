import { WebContainer } from '@webcontainer/api';
import { map, type MapStore } from 'nanostores';
import nodePath from '~/lib/polyfills/path.js';
import { absInWorkdir, relToWorkdir } from '~/lib/webcontainer/path';
import type { BoltAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import type { TerminalStore } from '~/lib/stores/terminal';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainerContext } from '~/lib/webcontainer';
import { extractCode, safeJsonParse } from '~/utils/sanitize';

const logger = createScopedLogger('ActionRunner');

// Reduce log noise in fallback mode
let webContainerUnavailableLogged = false;

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

export class ActionRunner {
  #webcontainer: Promise<WebContainer>;
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #terminalStore?: TerminalStore;

  /**
   * Resolve the absolute project root path by scanning the in-memory files map
   * for the first occurrence of package.json. Falls back to webcontainer.workdir.
   */
  async #getProjectRoot(): Promise<{ abs: string; rel: string }> {
    const webcontainer = await this.#webcontainer;
    try {
      const files = workbenchStore.files.get();
      const pkgCandidates = Object.entries(files)
        .filter(([filePath, dirent]) => dirent?.type === 'file' && this.#isPackageJsonPath(filePath))
        .map(([filePath]) => absInWorkdir(filePath))
        .sort((a, b) => a.length - b.length);

      if (pkgCandidates.length === 0) {
        return { abs: webcontainer.workdir, rel: '/' };
      }

      const projectRootAbs = nodePath.posix.dirname(pkgCandidates[0]);
      const projectRootRel = relToWorkdir(projectRootAbs);

      return {
        abs: projectRootAbs,
        rel: projectRootRel === '.' ? '/' : `/${projectRootRel}`,
      };
    } catch {
      return { abs: webcontainer.workdir, rel: '/' };
    }
  }

  /**
   * Build a dev command (executable + args only) with framework-aware fallback.
   * Caller is responsible for adding `cd <projectRootAbs> &&` if needed.
   */
  #buildDevCommand(projectRootAbs: string): string {
    try {
      const files = workbenchStore.files.get();
      const pkgEntry = Object.entries(files).find(
        ([filePath, dirent]) => dirent?.type === 'file' && this.#isPackageJsonPath(filePath),
      );
      const pkgContent = pkgEntry && pkgEntry[1]?.type === 'file' ? pkgEntry[1].content : '{}';
      const pkg = JSON.parse(pkgContent);
      const hasDev = Boolean(pkg?.scripts?.dev);
      const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) } as Record<string, string>;
      const hasVite = typeof deps['vite'] === 'string';
      const hasNext = typeof deps['next'] === 'string';

      if (hasDev) {
        if (hasVite) {
          return `pnpm run dev || pnpm exec vite`;
        }
        if (hasNext) {
          return `pnpm run dev || pnpm exec next dev`;
        }
        return `pnpm run dev`;
      }
      if (hasVite) {
        return `pnpm exec vite`;
      }
      if (hasNext) {
        return `pnpm exec next dev`;
      }
      // Unknown framework - attempt dev anyway
      return `pnpm run dev`;
    } catch {
      return `pnpm run dev`;
    }
  }

  actions: ActionsMap = map({});

  constructor(webcontainerPromise: Promise<WebContainer>, terminalStore?: TerminalStore) {
    this.#webcontainer = webcontainerPromise;
    this.#terminalStore = terminalStore;
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(actionId, {
      ...data.action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    this.#currentExecutionPromise.then(() => {
      this.#updateAction(actionId, { status: 'running' });
    });
  }

  async runAction(data: ActionCallbackData) {
    const { actionId } = data;
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      return;
    }

    this.#updateAction(actionId, { ...action, ...data.action, executed: true });

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(actionId);
      })
      .catch((error) => {
        console.error('Action failed:', error);
      });
  }

  async #executeAction(actionId: string) {
    const action = this.actions.get()[actionId];

    this.#updateAction(actionId, { status: 'running' });

    try {
      switch (action.type) {
        case 'shell': {
          const isDevServerCommand = this.#isDevServerCommand(action.content);
          await this.#runShellAction(action);
          
          // Only update status here for non-dev-server commands
          // Dev server commands handle their own status updates
          if (!isDevServerCommand) {
            this.#updateAction(actionId, { status: action.abortSignal.aborted ? 'aborted' : 'complete' });
          }
          break;
        }
        case 'file': {
          await this.#runFileAction(action);
          this.#updateAction(actionId, { status: action.abortSignal.aborted ? 'aborted' : 'complete' });
          break;
        }
      }
    } catch (error: any) {
      this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const actionId = Object.keys(this.actions.get()).find((id) => this.actions.get()[id] === action);
    const isDevServerCommandOriginal = this.#isDevServerCommand(action.content);

    if (isDevServerCommandOriginal) {
      logger.info('⚙️ Delegating dev server command to FilesStore bootstrap');

      if (action.abortSignal.aborted) {
        if (actionId) {
          this.#updateAction(actionId, { status: 'aborted' });
        }
        return;
      }

      // Avoid cascading retries; rely on FilesStore to guard the call
      workbenchStore.filesStore?.tryBootstrap?.();

      if (actionId) {
        const status = action.abortSignal.aborted ? 'aborted' : 'complete';
        this.#updateAction(actionId, { status });
      }

      return;
    }

    // Gate non-dev-server shell commands when WebContainer isn't ready
    if (!webcontainerContext.ready) {
      logger.info('⏭️ WebContainer not ready; deferring shell command until container initializes');
      
      if (actionId) {
        // Mark as complete to avoid blocking the UI; FilesStore will handle install automatically
        this.#updateAction(actionId, { status: 'complete' });
      }
      
      return;
    }

    const webcontainer = await this.#webcontainer;
    // Normalize and sanitize command for WebContainer environment (prefer pnpm over npm/yarn)
    let cleanedCommand = action.content;

    // Strip any residual bolt tags that may leak into content
    cleanedCommand = cleanedCommand
      .replace(/<\/?boltAction[^>]*>/gi, '')
      .replace(/<\/?boltArtifact[^>]*>/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Normalize to pnpm (prevent concatenation issues like "npmpnpm")
    function normalizeToPnpm(cmd: string): string {
      // Collapse whitespace
      let c = cmd.trim().replace(/\s+/g, ' ');

      // CRITICAL FIX: Remove duplicate/malformed package manager prefixes first
      // Handle cases like "npm pnpm install", "pnpm pnpm install", "npm npm install"
      c = c.replace(/^(npm|yarn|pnpm)\s+(npm|yarn|pnpm)\s+/i, '$2 ');
      
      // Also handle triple duplicates (just in case)
      c = c.replace(/^(npm|yarn|pnpm)\s+(npm|yarn|pnpm)\s+(npm|yarn|pnpm)\s+/i, '$3 ');

      // Replace full command patterns to avoid partial matches
      if (/^npm\s+install\b/i.test(c) || /^yarn\s+install\b/i.test(c)) {
        return 'pnpm install';
      }
      if (/^npm\s+run\s+dev\b/i.test(c) || /^yarn\s+dev\b/i.test(c)) {
        return 'pnpm run dev';
      }
      if (/^npm\s+run\s+start\b/i.test(c) || /^yarn\s+start\b/i.test(c)) {
        return 'pnpm run start';
      }
      if (/^npm\s+i\b/i.test(c)) {
        return 'pnpm i';
      }
      if (/^yarn\s+add\b/i.test(c)) {
        return 'pnpm add';
      }
      if (/^npx\b/i.test(c)) {
        return c.replace(/^npx\b/, 'pnpm dlx');
      }

      // For other commands, only replace npm/yarn if NOT already pnpm
      if (!/^pnpm\b/i.test(c)) {
        c = c.replace(/\bnpm\b/g, 'pnpm').replace(/\byarn\b/g, 'pnpm').replace(/\bnpx\b/g, 'pnpm dlx');
      }
      
      return c;
    }

    cleanedCommand = normalizeToPnpm(cleanedCommand);
    
    // Fix jsh incompatibilities - remove problematic redirect operators and pipes
    cleanedCommand = cleanedCommand
      // Remove file descriptor redirections (e.g., 2>&1, >&2, etc.)
      .replace(/\s*\d+>&\d+/g, '')
      .replace(/\s*>&\d+/g, '')
      .replace(/\s*\d+>/g, ' >')
      // Remove numbered redirects at the end (like >&56)  
      .replace(/\s*[>&]*\d+\s*$/g, '')
      // Remove complex pipe chains that might cause issues
      .replace(/\|\s*tee\s+[^|]+/g, '')
      // Clean up multiple spaces and whitespace
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanedCommand !== action.content) {
      logger.debug(`Original command: ${action.content}`);
      logger.debug(`Cleaned command for jsh: ${cleanedCommand}`);
    }

    try {
      const { abs: projectRootAbs } = await this.#getProjectRoot();

      // For install/dev commands, ensure we run in PROJECT_ROOT and set env
      const isInstall = /\bpnpm\s+(install|i)(\s|$)/.test(cleanedCommand);
      if (isInstall) {
        cleanedCommand = `cd ${projectRootAbs} && pnpm install`;
      }
      if (isDevServerCommandOriginal) {
        cleanedCommand = this.#buildDevCommand(projectRootAbs);
      }
      // Use jsh with cleaned command
      const isDevServerCommand = this.#isDevServerCommand(cleanedCommand);
      const env = {
        npm_config_yes: true as unknown as string,
        HOST: '0.0.0.0',
      } as Record<string, string>;

      const process = await webcontainer.spawn('/bin/jsh', ['-c', cleanedCommand], { env });

      action.abortSignal.addEventListener('abort', () => {
        process.kill();
      });

      process.output.pipeTo(
        new WritableStream({
          write: (data) => {
            // Send output to all attached terminals only (avoid console spam)
            const terminals = this.#terminalStore?.getTerminals() ?? [];
            for (const { terminal } of terminals) {
              terminal.write(data);
            }
          },
        }),
      );

      if (isDevServerCommand) {
        // For dev server commands, don't wait for exit - they run indefinitely
        // Set up a listener for port events to mark as complete when server is ready
        logger.debug('Dev server command detected, not waiting for exit');
        this.#handleDevServerProcess(action, process);
      } else {
        const exitCode = await process.exit;
        logger.debug(`Process terminated with code ${exitCode}`);
        
        // Log warning for failed commands but don't throw
        if (exitCode !== 0) {
          logger.warn(`Shell command failed with exit code ${exitCode}: ${cleanedCommand}`);
          const terminals = this.#terminalStore?.getTerminals() ?? [];
          for (const { terminal } of terminals) {
            terminal.write(`\n⚠️  Command exited with code ${exitCode}\n`);
          }
        }
      }
    } catch (error: unknown) {
      // Handle shell execution errors gracefully
      let errorObject: Error;
      if (error instanceof Error) {
        errorObject = error as Error;
      } else {
        errorObject = new Error(String(error));
      }
      logger.error('Shell command execution failed:', errorObject);
      const errorMessage = errorObject.message;
      
      // Send error to terminals
      const terminals = this.#terminalStore?.getTerminals() ?? [];
      for (const { terminal } of terminals) {
        terminal.write(`\n❌ Shell command failed: ${errorMessage}\n`);
        terminal.write(`Command: ${cleanedCommand}\n`);
        if (isDevServerCommandOriginal) {
          terminal.write(`💡 This was a dev server command. Files are still created and accessible in the workbench.\n`);
        terminal.write(`🔗 Try checking the dev server manually in your local environment.\n`);
        }
      }
      
      // For dev server commands, try to continue gracefully
      if (isDevServerCommandOriginal) {
        logger.warn('Dev server command failed but continuing - files were still created');
        // Don't throw, just log the issue
      } else {
        // For non-dev server commands, we can be more strict
        throw new Error(`Shell command failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Check if a shell command is likely a dev server command
   */
  #isDevServerCommand(command: string): boolean {
    const devServerPatterns = [
      /npm\s+run\s+dev/,
      /pnpm\s+run\s+dev/,
      /yarn\s+dev/,
      /pnpm\s+dev/,
      /vite\s*$/,
      /vite\s+dev/,
      /next\s+dev/,
      /next\s+start/,
      /pnpm\s+run\s+start/,
      /npm\s+run\s+start/,
      /yarn\s+start/,
      /remix\s+dev/,
      /nuxt\s+dev/,
      /svelte-kit\s+dev/,
      /astro\s+dev/,
      /ng\s+serve/,
      /gatsby\s+develop/,
    ];

    return devServerPatterns.some(pattern => pattern.test(command.trim()));
  }

  /**
   * Handle dev server processes that run indefinitely
   */
  async #handleDevServerProcess(action: ActionState, process: any) {
    // Set action as running and wait for port event or timeout
    const actionId = Object.keys(this.actions.get()).find(
      id => this.actions.get()[id] === action
    );

    if (!actionId) return;

    const webcontainer = await this.#webcontainer;
    let completed = false;
    let processExited = false;
    
    // Set up port listener to detect when dev server is ready
    const portListener = (port: number, type: string) => {
      if (type === 'open' && !completed) {
        logger.debug(`Dev server port ${port} opened, marking action as complete`);
        completed = true;
        this.#updateAction(actionId, { status: 'complete' });
      }
    };

    webcontainer.on('port', portListener);

    // Monitor process exit to detect early failures
    process.exit.then((exitCode: number) => {
      processExited = true;
      if (!completed && exitCode !== 0) {
        logger.error(`Dev server exited early with code ${exitCode}`);
        completed = true;
        this.#updateAction(actionId, { 
          status: 'failed', 
          error: 'Dev server failed to start - did you install dependencies? Check terminal for errors.' 
        });
        
        // Write error message to terminals
        const terminals = this.#terminalStore?.getTerminals() ?? [];
        for (const { terminal } of terminals) {
          terminal.write('\r\n\x1b[31m❌ Dev server failed to start. Make sure dependencies are installed with `pnpm install`\x1b[0m\r\n');
        }
      }
    }).catch(() => {
      // Process was killed/aborted, not an error
    });

    // Quick exit detection - if process exits within 1 second, it's likely a dependency issue
    setTimeout(() => {
      if (processExited && !completed) {
        logger.error('Dev server exited too quickly, likely missing dependencies');
        completed = true;
        this.#updateAction(actionId, { 
          status: 'failed', 
          error: 'Dev server failed to start - dependencies may be missing. Run `pnpm install` first.' 
        });
      }
    }, 1000); // 1 second timeout for quick failures

    // Timeout fallback in case no port is detected (fallback to normal completion)
    setTimeout(() => {
      if (!completed && !processExited) {
        const currentAction = this.actions.get()[actionId];
        if (currentAction && currentAction.status === 'running') {
          logger.debug('Dev server timeout reached, assuming server is running');
          completed = true;
          this.#updateAction(actionId, { status: 'complete' });
        }
      }
    }, 30000); // 30 second timeout
  }

  async #runFileAction(action: ActionState) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    let processedContent = extractCode(action.content);

    if (this.#isPackageJsonPath(action.filePath)) {
      const raw = extractCode(action.content, 'json');
      let pkg = safeJsonParse(raw, null);

      if (!pkg) {
        pkg = {
          name: 'app',
          private: true,
          version: '0.0.0',
          scripts: {
            dev: 'vite',
          },
          devDependencies: {
            vite: 'latest',
          },
        };
        logger.info('Generated minimal package.json due to invalid input');
      }

      if (!pkg.scripts) pkg.scripts = {};

      pkg.scripts.dev ??= 'vite';
      processedContent = JSON.stringify(pkg, null, 2);
      logger.debug('Processed package.json');
    }

    if (webcontainerContext.ready) {
      try {
        await workbenchStore.filesStore?.saveFile(action.filePath, processedContent);
        logger.debug(`File written to WebContainer via FilesStore: ${action.filePath}`);
        return;
      } catch (error) {
        logger.error('Failed to write file via WebContainer:', error);
        throw error;
      }
    }

    if (!webContainerUnavailableLogged) {
      logger.warn('WebContainer not ready; using fallback file storage');
      webContainerUnavailableLogged = true;
    }

    try {
      const absPath = absInWorkdir(action.filePath);
      const currentFiles = workbenchStore.files.get();
      const existingFile = currentFiles[absPath];

      if (existingFile && existingFile.type === 'file' && existingFile.content === processedContent) {
        logger.debug(`File ${absPath} unchanged; skipping FilesStore update`);
        return;
      }

      const updatedFiles = {
        ...currentFiles,
        [absPath]: {
          type: 'file' as const,
          content: processedContent,
          isBinary: false,
        },
      };

      const relPath = relToWorkdir(absPath);
      const segments = relPath.split('/');
      if (segments.length > 1) {
        let prefix = '';
        for (let i = 0; i < segments.length - 1; i++) {
          prefix = prefix ? `${prefix}/${segments[i]}` : segments[i];
          const dirAbs = absInWorkdir(prefix);
          if (!updatedFiles[dirAbs]) {
            updatedFiles[dirAbs] = { type: 'folder' as const };
          }
        }
      }

      workbenchStore.files.set(updatedFiles);
      logger.info(`File written to FilesStore (fallback mode): ${absPath} - WebContainer not available`);
    } catch (fallbackError) {
      logger.error('Failed to write file to fallback storage:', fallbackError);
      throw fallbackError;
    }
  }

  #isPackageJsonPath(targetPath: string) {
    try {
      const rel = relToWorkdir(targetPath);
      return rel === 'package.json' || rel.endsWith('/package.json');
    } catch {
      return false;
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }
}
