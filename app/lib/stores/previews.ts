import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
  currentUrl?: string;
}

const MAX_PREVIEWS = 10; // Maximum number of previews to track

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #webcontainer: Promise<WebContainer>;
  #cleanup: (() => void) | null = null;
  #logger = createScopedLogger('PreviewsStore');
  #readyPorts = new Set<number>();

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
      this.#readyPorts.clear();

      // Clear any references to help garbage collection
      this.#webcontainer = new Promise(() => {
        // noop - disposed
      });

      console.log('PreviewsStore disposed and cleaned up');
    } catch (error) {
      console.warn('Error during PreviewsStore disposal:', error);
    }
  }

  #normalizePreviewUrl(rawUrl: string, fallbackPort: number) {
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
      return `http://localhost:${fallbackPort}`;
    }
  }

  #maybeAdjustForHostPort(port: number, url: string) {
    if (typeof window === 'undefined') {
      return url;
    }

    const hostPort = Number.parseInt(window.location.port || '', 10);
    if (!Number.isNaN(hostPort) && hostPort === port) {
      try {
        const parsed = new URL(url);
        parsed.searchParams.set('embed', '1');
        this.#logger.warn(`Preview port ${port} matches host application port; using embed mode.`);
        return parsed.toString();
      } catch {
        this.#logger.warn(`Preview port ${port} matches host application port; unable to adjust URL.`);
      }
    }

    return url;
  }

  // Manually mark a preview as ready (used when dev server starts)
  markPreviewReady(port: number, baseUrl: string) {
    const normalizedUrl = this.#normalizePreviewUrl(baseUrl, port);
    const finalUrl = this.#maybeAdjustForHostPort(port, normalizedUrl);

    const existingPreview = this.#availablePreviews.get(port);
    let previewInfo = existingPreview;

    if (this.#readyPorts.has(port)) {
      if (previewInfo) {
        if (previewInfo.baseUrl !== finalUrl) {
          previewInfo.baseUrl = finalUrl;
          previewInfo.currentUrl ??= finalUrl;
          this.previews.set(Array.from(this.#availablePreviews.values()));
        }
      }
      return;
    }

    if (previewInfo) {
      previewInfo.ready = true;
      previewInfo.baseUrl = finalUrl;
      previewInfo.currentUrl ??= finalUrl;
    } else {
      previewInfo = { port, ready: true, baseUrl: finalUrl, currentUrl: finalUrl };
      this.#availablePreviews.set(port, previewInfo);
    }

    this.#logger.info(`Preview marked ready: ${finalUrl}`);

    this.#readyPorts.add(port);
    this.#triggerIframeReload(port, finalUrl);
    this.previews.set(Array.from(this.#availablePreviews.values()));
  }

  #triggerIframeReload(port: number, baseUrl: string) {
    if (typeof document === 'undefined') {
      return;
    }

    const iframe = document.querySelector<HTMLIFrameElement>(`iframe[data-preview-port="${port}"]`) ?? document.querySelector<HTMLIFrameElement>('iframe[data-preview="active"]');
    const previewInfo = this.#availablePreviews.get(port);

    if (!iframe) {
      return;
    }

    const applySrc = () => {
      let finalUrl = baseUrl;
      try {
        const url = new URL(baseUrl);
        url.searchParams.set('t', String(Date.now()));
        finalUrl = url.toString();
      } catch {
        // leave finalUrl as baseUrl
      }
      iframe.src = finalUrl;
      if (previewInfo) {
        previewInfo.currentUrl = finalUrl;
      }
      this.previews.set(Array.from(this.#availablePreviews.values()));
    };

    let retried = false;

    const onLoad = () => {
      iframe.removeEventListener('error', onError);
      iframe.removeEventListener('load', onLoad);
      iframe.removeAttribute('data-preview-error');
    };

    const onError = () => {
      if (retried) {
        iframe.removeEventListener('error', onError);
        iframe.removeEventListener('load', onLoad);
        return;
      }

      retried = true;
      iframe.setAttribute('data-preview-error', 'true');
      setTimeout(applySrc, 600);
    };

    iframe.addEventListener('error', onError);
    iframe.addEventListener('load', onLoad);
    applySrc();
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
        this.#logger.info(`🔌 WebContainer port event: port=${port}, type=${type}, url=${url}`);
        
        try {
          let previewInfo = this.#availablePreviews.get(port);

          if (type === 'close' && previewInfo) {
            this.#availablePreviews.delete(port);
            this.previews.set(this.previews.get().filter((preview) => preview.port !== port));
            return;
          }

          if (type === 'open') {
            // Port is actually open - mark it ready immediately with the real WebContainer URL
            this.markPreviewReady(port, url);
            
            // PRIORITY FIX: If port 3000 opens (Next.js default), make it the primary preview
            // by moving it to the front of the array
            if (port === 3000 || port === 8000 || port === 8080) {
              const previews = this.previews.get();
              const port3000Index = previews.findIndex(p => p.port === port);
              if (port3000Index > 0) {
                const port3000Preview = previews.splice(port3000Index, 1)[0];
                if (port3000Preview) {
                  previews.unshift(port3000Preview);
                  this.previews.set([...previews]);
                  this.#logger.info(`🎯 Prioritized port ${port} as primary preview`);
                }
              }
            }
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
            // Normalize URL: use localhost for iframe display, but dev server binds to 0.0.0.0
            let normalizedUrl = url;
            try {
              const u = new URL(url);
              if (!u.hostname || u.hostname === 'localhost' || u.hostname === '0.0.0.0') {
                u.hostname = 'localhost'; // Use localhost for iframe compatibility
              }
              normalizedUrl = u.toString();
            } catch {
              if (url.startsWith(':')) {
                normalizedUrl = `http://localhost${url}`; // Use localhost for iframe
              }
            }

            previewInfo = { port, ready: type === 'open', baseUrl: normalizedUrl };
            this.#availablePreviews.set(port, previewInfo);
            previews.push(previewInfo);
          }

          previewInfo.ready = type === 'open';
          // Keep last normalized URL (ensure localhost for iframe compatibility)
          if (previewInfo.baseUrl) {
            try {
              const u = new URL(previewInfo.baseUrl);
              if (u.hostname === '0.0.0.0') {
                u.hostname = 'localhost';
                previewInfo.baseUrl = u.toString();
              }
            } catch {
              // If URL parsing fails, keep existing
            }
          } else {
            previewInfo.baseUrl = url;
          }

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

      // Set initial fallback previews so users can see URLs while waiting for dev server
      // Note: Use localhost for iframe display, but dev servers bind to 0.0.0.0
      // Avoid the host app port (commonly 5173) so the iframe does not load the platform
      const initialPreviews = [
        { port: 5174, ready: false, baseUrl: 'http://localhost:5174' },
        { port: 5175, ready: false, baseUrl: 'http://localhost:5175' },
        { port: 4173, ready: false, baseUrl: 'http://localhost:4173' },
        { port: 4174, ready: false, baseUrl: 'http://localhost:4174' }
      ];

      this.previews.set(initialPreviews);
      initialPreviews.forEach(preview => {
        this.#availablePreviews.set(preview.port, preview);
      });

      this.#logger.info('Ready - waiting for dev server to start');
    } catch (error) {
      this.#logger.error('Initialization error:', error);

      // Enhanced fallback mode with better error handling and user guidance
      const isTimeoutError = error instanceof Error && error.message.includes('timeout');
      
      if (isTimeoutError) {
        this.#logger.warn('WebContainer init timed out - try closing other tabs or a different browser');
      }

      // Set up fallback preview ports that users can manually check
      // Use localhost for iframe compatibility
      const fallbackPreviews = [
        { port: 5174, ready: false, baseUrl: 'http://localhost:5174' },
        { port: 5175, ready: false, baseUrl: 'http://localhost:5175' },
        { port: 4173, ready: false, baseUrl: 'http://localhost:4173' },
        { port: 4174, ready: false, baseUrl: 'http://localhost:4174' }
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
