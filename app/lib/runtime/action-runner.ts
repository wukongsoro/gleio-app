import { WebContainer } from '@webcontainer/api';
import { map, type MapStore } from 'nanostores';
import nodePath from '~/lib/polyfills/path.js';
import type { BoltAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import type { TerminalStore } from '~/lib/stores/terminal';
import { workbenchStore } from '~/lib/stores/workbench';

const logger = createScopedLogger('ActionRunner');

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
    } catch (error) {
      this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const webcontainer = await this.#webcontainer;
    const isDevServerCommand = this.#isDevServerCommand(action.content);

    // Clean up shell command to avoid jsh compatibility issues
    let cleanedCommand = action.content;
    
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
      // Use jsh with cleaned command
      const process = await webcontainer.spawn('/bin/jsh', ['-c', cleanedCommand], {
        env: { npm_config_yes: true },
      });

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
    } catch (shellError) {
      // Handle shell execution errors gracefully
      logger.error('Shell command execution failed:', shellError);
      const errorMessage = shellError instanceof Error ? shellError.message : String(shellError);
      
      // Send error to terminals
      const terminals = this.#terminalStore?.getTerminals() ?? [];
      for (const { terminal } of terminals) {
        terminal.write(`\n❌ Shell command failed: ${errorMessage}\n`);
        terminal.write(`Command: ${cleanedCommand}\n`);
        if (isDevServerCommand) {
          terminal.write(`💡 This was a dev server command. Files are still created and accessible in the workbench.\n`);
          terminal.write(`🔗 Try checking http://localhost:3000 manually if you set up a dev server locally.\n`);
        }
      }
      
      // For dev server commands, try to continue gracefully
      if (isDevServerCommand) {
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
      /yarn\s+dev/,
      /pnpm\s+dev/,
      /vite\s*$/,
      /vite\s+dev/,
      /next\s+dev/,
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
          terminal.write('\r\n\x1b[31m❌ Dev server failed to start. Make sure dependencies are installed with `npm install`\x1b[0m\r\n');
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
          error: 'Dev server failed to start - dependencies may be missing. Run `npm install` first.' 
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

    let webcontainerAvailable = false;
    let resolvedFilePath = action.filePath;

    try {
      const webcontainer = await this.#webcontainer;
      webcontainerAvailable = true;

      // Resolve relative paths against the container workdir to ensure files end up inside the project directory
      resolvedFilePath = action.filePath.startsWith('/')
        ? action.filePath
        : nodePath.join(webcontainer.workdir, action.filePath);

      let folder = nodePath.dirname(resolvedFilePath);

      // remove trailing slashes
      folder = folder.replace(/\/+$/g, '');

      if (folder !== '.') {
        try {
          await webcontainer.fs.mkdir(folder, { recursive: true });
          logger.debug('Created folder', folder);
        } catch (error) {
          logger.error('Failed to create folder\n\n', error);
        }
      }

      await webcontainer.fs.writeFile(resolvedFilePath, action.content);
      logger.debug(`File written to WebContainer: ${action.filePath}`);
      
    } catch (error) {
      webcontainerAvailable = false;
      logger.warn('WebContainer unavailable, using fallback file storage:', error instanceof Error ? error.message : String(error));
    }

    // Fallback: Always update the FilesStore so files are visible in the workbench
    // This handles both WebContainer failures and provides immediate UI updates
    try {
      // Normalize path for FilesStore (use forward slashes, ensure leading slash)
      let normalizedPath = action.filePath.replace(/\\/g, '/');
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }

      const currentFiles = workbenchStore.files.get();
      const updatedFiles = {
        ...currentFiles,
        [normalizedPath]: {
          type: 'file' as const,
          content: action.content,
          isBinary: false
        }
      };

      // Also create parent directories if they don't exist
      const parts = normalizedPath.split('/');
      for (let i = 1; i < parts.length - 1; i++) {
        const dirPath = '/' + parts.slice(1, i + 1).join('/');
        if (!updatedFiles[dirPath]) {
          updatedFiles[dirPath] = {
            type: 'folder' as const
          };
        }
      }

      workbenchStore.files.set(updatedFiles);
      
      if (webcontainerAvailable) {
        logger.debug(`File written to both WebContainer and FilesStore: ${action.filePath}`);
      } else {
        logger.info(`File written to FilesStore (fallback mode): ${action.filePath} - WebContainer not available`);
      }
      
    } catch (fallbackError) {
      logger.error('Failed to write file to fallback storage:', fallbackError);
      throw fallbackError;
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }
}
