import type { PathWatcherEvent, WebContainer } from '@webcontainer/api';
import { getEncoding } from 'istextorbinary';
import { map, type MapStore } from 'nanostores';
import { Buffer } from 'buffer';
import * as nodePath from 'path';
import { bufferWatchEvents } from '~/utils/buffer';
import { WORK_DIR } from '~/utils/constants';
import { computeFileModifications } from '~/utils/diff';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';

const logger = createScopedLogger('FilesStore');

const utf8TextDecoder = new TextDecoder('utf8', { fatal: true });

// Memory management constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit per file
const MAX_TOTAL_FILES = 1000; // Maximum number of files to track
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

export type FileMap = Record<string, Dirent | undefined>;

export class FilesStore {
  #webcontainer: Promise<WebContainer>;

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
      logger.warn(`Removed ${excessCount} files to enforce memory limits`);
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
    try {
      const webcontainer = await this.#webcontainer;

      const relativePath = nodePath.relative(webcontainer.workdir, filePath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid file path, write '${relativePath}'`);
      }

      const oldContent = this.getFile(filePath)?.content;

      if (!oldContent) {
        unreachable('Expected content to be defined');
      }

      await webcontainer.fs.writeFile(relativePath, content);

      if (!this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.set(filePath, oldContent);
      }

      // we immediately update the file and don't rely on the `change` event coming from the watcher
      this.files.setKey(filePath, { type: 'file', content, isBinary: false });

      logger.info('File updated');
    } catch (error) {
      logger.error('Failed to update file content\n\n', error);
      
      // In fallback mode, still update the in-memory representation
      const oldContent = this.getFile(filePath)?.content;
      if (oldContent && !this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.set(filePath, oldContent);
      }
      
      this.files.setKey(filePath, { type: 'file', content, isBinary: false });
      logger.warn('File updated in fallback mode (changes not persisted to WebContainer)');

      throw error;
    }
  }

  async #init() {
    try {
      const webcontainer = await this.#webcontainer;

      webcontainer.internal.watchPaths(
        { include: [`${WORK_DIR}/**`], exclude: ['**/node_modules', '.git'], includeContent: true },
        bufferWatchEvents(100, this.#processEventBuffer.bind(this)),
      );
      
      logger.info('FilesStore initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize FilesStore with WebContainer:', error);
      
      // Set up enhanced fallback mode without file watching but with manual file support
      this.files.set({
        '/package.json': {
          type: 'file',
          content: '{\n  "name": "fallback-project",\n  "version": "1.0.0",\n  "private": true,\n  "description": "Project running in fallback mode - WebContainer failed to initialize"\n}',
          isBinary: false
        },
        '/README.md': {
          type: 'file',
          content: '# Project in Fallback Mode\n\nWebContainer failed to initialize, but files generated by the AI will still be visible here.\n\n## Troubleshooting\n\n1. Close other browser tabs and refresh\n2. Try a different browser (Chrome/Firefox work best)\n3. Check your system memory (need ~4GB+ available)\n4. Run `window.emergencyMemoryCleanup()` in the browser console\n\n## Manual Preview\n\nIf you have files that should be served, you can:\n- Copy the generated code to your local editor\n- Run it locally with your preferred dev server\n- Check these URLs manually: http://localhost:3000, http://localhost:3001, etc.',
          isBinary: false
        }
      });
      
      logger.warn('FilesStore running in enhanced fallback mode without WebContainer - manual file operations still supported');
    }
  }

  #processEventBuffer(events: Array<[events: PathWatcherEvent[]]>) {
    const watchEvents = events.flat(2);

    for (const { type, path, buffer } of watchEvents) {
      try {
        // remove any trailing slashes
        const sanitizedPath = path.replace(/\/+$/g, '');

        switch (type) {
          case 'add_dir': {
            // we intentionally add a trailing slash so we can distinguish files from folders in the file tree
            this.files.setKey(sanitizedPath, { type: 'folder' });
            break;
          }
          case 'remove_dir': {
            this.files.setKey(sanitizedPath, undefined);

            for (const [direntPath] of Object.entries(this.files.get())) {
              if (direntPath.startsWith(sanitizedPath)) {
                this.files.setKey(direntPath, undefined);
                this.#modifiedFiles.delete(direntPath);
              }
            }

            break;
          }
          case 'add_file':
          case 'change': {
            // Check file size limits before processing
            if (!this.#isFileSizeAcceptable(buffer)) {
              logger.warn(`File ${sanitizedPath} exceeds size limit (${buffer?.byteLength} bytes), skipping`);
              break;
            }

            if (type === 'add_file') {
              this.#size++;
              // Enforce memory limits when adding files
              this.#enforceMemoryLimits();
            }

            let content = '';

            /**
             * @note This check is purely for the editor. The way we detect this is not
             * bullet-proof and it's a best guess so there might be false-positives.
             * The reason we do this is because we don't want to display binary files
             * in the editor nor allow to edit them.
             */
            const isBinary = isBinaryFile(buffer);

            if (!isBinary && this.#shouldLoadFileContent(buffer)) {
              content = this.#decodeFileContent(buffer);
            } else if (!isBinary) {
              // File is too large to load content, but not binary
              content = `[File too large to display: ${buffer?.byteLength || 0} bytes]`;
            }

            this.files.setKey(sanitizedPath, { type: 'file', content, isBinary });

            break;
          }
          case 'remove_file': {
            this.#size--;
            this.files.setKey(sanitizedPath, undefined);
            this.#modifiedFiles.delete(sanitizedPath);
            break;
          }
          case 'update_directory': {
            // we don't care about these events
            break;
          }
        }
      } catch (error) {
        logger.error(`Error processing file event for ${path}:`, error);
        // Continue processing other events even if one fails
      }
    }
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
