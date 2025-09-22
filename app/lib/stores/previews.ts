import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
}

const MAX_PREVIEWS = 10; // Maximum number of previews to track

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #webcontainer: Promise<WebContainer>;
  #cleanup: (() => void) | null = null;
  #logger = createScopedLogger('PreviewsStore');

  previews = atom<PreviewInfo[]>([]);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    this.#init();
  }

  dispose() {
    try {
      if (this.#cleanup) {
        this.#cleanup();
        this.#cleanup = null;
      }
      this.#availablePreviews.clear();
      this.previews.set([]);

      // Clear any references to help garbage collection
      this.#webcontainer = new Promise(() => {
        // noop - disposed
      });

      console.log('PreviewsStore disposed and cleaned up');
    } catch (error) {
      console.warn('Error during PreviewsStore disposal:', error);
    }
  }

  async #init() {
    try {
      this.#logger.info('Initializing previews...');

      // Add timeout to WebContainer promise to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('PreviewsStore initialization timeout')), 15000);
      });

      const webcontainer = await Promise.race([this.#webcontainer, timeoutPromise]);

      // Verify WebContainer is functional
      if (!webcontainer || typeof webcontainer.on !== 'function') {
        throw new Error('WebContainer is not functional');
      }

      const portHandler = (port: number, type: string, url: string) => {
        try {
          let previewInfo = this.#availablePreviews.get(port);

          if (type === 'close' && previewInfo) {
            this.#availablePreviews.delete(port);
            this.previews.set(this.previews.get().filter((preview) => preview.port !== port));
            return;
          }

          const previews = this.previews.get();

          // Enforce preview limits
          if (!previewInfo && previews.length >= MAX_PREVIEWS) {
            // Remove oldest preview to make room
            const oldestPreview = previews[0];
            if (oldestPreview) {
              this.#availablePreviews.delete(oldestPreview.port);
              previews.shift();
            }
          }

          if (!previewInfo) {
            previewInfo = { port, ready: type === 'open', baseUrl: url };
            this.#availablePreviews.set(port, previewInfo);
            previews.push(previewInfo);
          }

          previewInfo.ready = type === 'open';
          previewInfo.baseUrl = url;

          this.previews.set([...previews]);
        } catch (error) {
          console.error('Error handling port event:', error);
        }
      };

      webcontainer.on('port', portHandler);

      // Store cleanup function - WebContainer doesn't have 'off', but we can track handlers
      this.#cleanup = () => {
        // WebContainer API doesn't provide removeListener, so we'll mark as disposed
        this.#logger.debug('Disposed');
      };

      this.#logger.info('Ready');
    } catch (error) {
      this.#logger.error('Initialization error:', error);

      // Enhanced fallback mode with better error handling and user guidance
      const isTimeoutError = error instanceof Error && error.message.includes('timeout');
      
      if (isTimeoutError) {
        this.#logger.warn('WebContainer init timed out - try closing other tabs or a different browser');
      }

      // Set up fallback preview ports that users can manually check
      const fallbackPreviews = [
        { port: 3000, ready: false, baseUrl: 'http://localhost:3000' },
        { port: 3001, ready: false, baseUrl: 'http://localhost:3001' },
        { port: 5000, ready: false, baseUrl: 'http://localhost:5000' },
        { port: 8000, ready: false, baseUrl: 'http://localhost:8000' }
      ];

      this.previews.set(fallbackPreviews);
      this.#availablePreviews.clear();
      
      // Add fallback previews to the available map
      fallbackPreviews.forEach(preview => {
        this.#availablePreviews.set(preview.port, preview);
      });

      this.#cleanup = () => {
        this.#logger.debug('Disposed (fallback mode)');
      };

      // Emit an event to notify UI components about the failure
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('previews-store-error', {
          detail: {
            message: 'WebContainer failed to initialize - running in fallback mode',
            error: error instanceof Error ? error.message : String(error),
            fallbackMode: true,
            isTimeout: isTimeoutError,
            fallbackPreviews: fallbackPreviews.map(p => p.baseUrl)
          }
        });
        window.dispatchEvent(event);
      }

      this.#logger.warn('Fallback mode enabled; preview URLs available for manual check');
    }
  }
}
