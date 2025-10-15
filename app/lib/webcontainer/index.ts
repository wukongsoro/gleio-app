import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';

interface WebContainerContext {
  loaded: boolean;
  error?: Error;
  retryCount: number;
  disabled: boolean;
  memoryConstrained: boolean;
  ready: boolean; // Global flag to indicate if WebContainer is ready for operations
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
  retryCount: 0,
  disabled: false,
  memoryConstrained: false,
  ready: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

// One-time log when client module loads
if (typeof window !== 'undefined' && !import.meta.env.SSR) {
  console.log('🚀 WebContainer client module loaded');
}

const MAX_RETRY_ATTEMPTS = 2; // Reduce retries to avoid instance pressure after OOM
const CONTAINER_TIMEOUT = 30000; // Reasonable timeout to fail faster and provide feedback
const MEMORY_THRESHOLD = 4 * 1024 * 1024 * 1024; // 4GB minimum memory

let isInitializing = false; // Prevent multiple concurrent initialization attempts

// Enhanced memory detection with better accuracy and monitoring
function detectMemoryConstraints(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    let hasMemoryIssues = false;
    let warnings: string[] = [];

    // Check available memory if supported
    if ('memory' in performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      const usedMemory = memory.usedJSHeapSize || memory.totalJSHeapSize;
      const totalMemory = memory.jsHeapSizeLimit || memory.totalJSHeapSize;

      if (totalMemory && usedMemory) {
        const freeMemory = totalMemory - usedMemory;
        const freeMemoryMB = Math.round(freeMemory / 1024 / 1024);
        const usedMemoryMB = Math.round(usedMemory / 1024 / 1024);
        const totalMemoryMB = Math.round(totalMemory / 1024 / 1024);

        console.log(`Memory status: ${usedMemoryMB}MB used, ${freeMemoryMB}MB free, ${totalMemoryMB}MB total`);

        // More conservative memory check - ensure we have enough free memory
        if (freeMemory < 600 * 1024 * 1024) { // Increased to 600MB minimum free
          warnings.push(`Insufficient free memory: ${freeMemoryMB}MB < 600MB required`);
          hasMemoryIssues = true;
        }

        // Check if we're using more than 80% of available memory
        const usagePercent = (usedMemory / totalMemory) * 100;
        if (usagePercent > 80) {
          warnings.push(`High memory usage: ${usagePercent.toFixed(1)}% of heap used`);
          hasMemoryIssues = true;
        }

        // Also check total memory isn't too low
        if (totalMemoryMB < 1024) { // Less than 1GB total
          warnings.push(`Low total memory: ${totalMemoryMB}MB < 1024MB minimum`);
          hasMemoryIssues = true;
        }
      }
    }

    // Check device memory API if available
    if ('deviceMemory' in navigator) {
      const deviceMemory = (navigator as any).deviceMemory;
      if (deviceMemory && deviceMemory < 2) { // Less than 2GB device memory
        warnings.push(`Low device memory: ${deviceMemory}GB < 2GB minimum`);
        hasMemoryIssues = true;
      }
    }

    // Check for mobile browsers - be more restrictive on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      console.log('Mobile browser detected - checking memory more carefully');

      // On mobile, be stricter about memory requirements
      if ('memory' in performance && (performance as any).memory) {
        const memory = (performance as any).memory;
        const totalMemory = memory.jsHeapSizeLimit || memory.totalJSHeapSize;

        if (totalMemory && totalMemory < 1024 * 1024 * 1024) { // Less than 1GB on mobile
          warnings.push('Mobile device with insufficient memory for WebContainer');
          hasMemoryIssues = true;
        }
      }
    }

    // Check if there are multiple tabs/windows open (potential memory competition)
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      // This is a rough heuristic - if we've had multiple initialization attempts, assume memory competition
      if (webcontainerContext.retryCount > 2) {
        warnings.push('Multiple initialization attempts detected - possible memory competition from other tabs');
        hasMemoryIssues = true;
      }
    }

    // Log all warnings
    if (warnings.length > 0) {
      console.warn('WebContainer memory constraints detected:', warnings);
    }

    return hasMemoryIssues;
  } catch (error) {
    console.warn('Could not detect memory constraints:', error);
    // If we can't detect memory, be conservative but don't automatically disable
    return false;
  }
}

// Check if WebContainer should be disabled (only user-controlled disabling)
function shouldDisableWebContainer(): boolean {
  // Check environment variable or localStorage setting
  if (typeof window !== 'undefined') {
    const disabledByUser = localStorage.getItem('webcontainer_disabled') === 'true';
    if (disabledByUser) {
      console.log('WebContainer disabled by user setting');
      return true;
    }
  }

  // Memory constraints are now warnings only - don't disable automatically
  return false;
}

// Allow manual enabling/disabling of WebContainer
export function setWebContainerEnabled(enabled: boolean) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('webcontainer_disabled', (!enabled).toString());
    webcontainerContext.disabled = !enabled;

    if (enabled) {
      webcontainerContext.ready = false; // Will be set to true when re-initialized
      console.log('WebContainer re-enabled. Please refresh the page to take effect.');
    } else {
      console.log('WebContainer disabled. Running in chat-only mode.');
    }
  }
}

// Utility function to check and fix WebContainer status
export function checkAndFixWebContainer(): { enabled: boolean; status: string; canFix: boolean } {
  if (typeof window === 'undefined') {
    return { enabled: false, status: 'SSR mode', canFix: false };
  }

  const disabledByUser = localStorage.getItem('webcontainer_disabled') === 'true';

  if (disabledByUser) {
    return {
      enabled: false,
      status: 'Disabled by user',
      canFix: true
    };
  }

  return { enabled: true, status: 'Enabled', canFix: false };
}

// Force reset WebContainer - clears all settings and re-enables
export function forceResetWebContainer(): boolean {
  if (typeof window === 'undefined') {
    console.log('Cannot reset WebContainer in SSR mode');
    return false;
  }

  try {
    // Clear WebContainer related localStorage entries (only user-controlled ones)
    localStorage.removeItem('webcontainer_disabled');

    // Reset context state
    webcontainerContext.disabled = false;
    webcontainerContext.ready = false;
    webcontainerContext.error = undefined;
    webcontainerContext.retryCount = 0;

    console.log('✅ WebContainer has been force reset! Please refresh the page to apply changes.');
    return true;
  } catch (error) {
    console.error('Failed to reset WebContainer:', error);
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function forceGarbageCollection() {
  if (typeof window !== 'undefined' && 'gc' in window) {
    try {
      (window as any).gc();
    } catch (e) {
      // Garbage collection not available
    }
  }
}

async function initWebContainer(): Promise<WebContainer> {
  console.log('🔄 initWebContainer called');

  // Check browser compatibility
  if (typeof window !== 'undefined') {
    const isCrossOriginIsolated = window.crossOriginIsolated;
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

    console.log('🔍 Browser compatibility check:', {
      crossOriginIsolated: isCrossOriginIsolated,
      hasSharedArrayBuffer,
      userAgent: navigator.userAgent.substring(0, 100)
    });

    if (!isCrossOriginIsolated) {
      throw new Error('WebContainer requires cross-origin isolation (COOP/COEP headers)');
    }

    if (!hasSharedArrayBuffer) {
      throw new Error('WebContainer requires SharedArrayBuffer support');
    }
  }

  // Check if WebContainer should be disabled (only user-controlled)
  const shouldDisable = shouldDisableWebContainer();
  if (shouldDisable) {
    webcontainerContext.disabled = true;
    webcontainerContext.ready = false;
    const error = new Error('WebContainer disabled by user setting');
    webcontainerContext.error = error;
    console.log('WebContainer initialization skipped - running in chat-only mode');

    // Emit event for UI components to react
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('webcontainer-error', {
        detail: {
          message: 'WebContainer disabled by user setting',
          reason: 'user_setting',
          canFix: true,
          fixInstructions: 'To re-enable WebContainer, run: window.enableWebContainer() in the browser console, then refresh the page.'
        }
      });
      window.dispatchEvent(event);
    }

    throw error;
  }

  // Check memory constraints (warnings only, don't block)
  if (typeof window !== 'undefined') {
    const hasMemoryWarnings = detectMemoryConstraints();
    if (hasMemoryWarnings) {
      console.warn('⚠️ Memory constraints detected - WebContainer may be slow or unstable, but will attempt initialization');
    }
  }

  // Enhanced memory cleanup before initialization
  if (typeof window !== 'undefined') {
    try {
      console.log('🧹 Performing pre-initialization memory cleanup...');

      // Force garbage collection if available
      forceGarbageCollection();

      // Clear any existing WebContainer caches
      clearWebContainerCache();

      // Small delay to allow memory to stabilize
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (e) {
      console.warn('Memory optimization failed, proceeding anyway:', e);
    }
  }

  if (isInitializing) {
    throw new Error('WebContainer initialization already in progress');
  }

  isInitializing = true;
  
  try {
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        console.log(`🔄 Initializing WebContainer (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);

        // Enhanced memory cleanup before each attempt
        forceGarbageCollection();

        // Check memory status before attempting
        if (typeof window !== 'undefined') {
          const memoryStatus = (window as any).checkMemory?.();
          if (memoryStatus?.browserMemory) {
            const freeMB = parseInt(memoryStatus.browserMemory.free);
            console.log(`Memory before attempt ${attempt + 1}: ${freeMB}MB free`);
          }
        }

        // Create a timeout promise to prevent hanging
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('WebContainer initialization timeout')), CONTAINER_TIMEOUT);
        });

        const containerPromise = WebContainer.boot({
          workdirName: WORK_DIR_NAME,
        });

        const container = await Promise.race([containerPromise, timeoutPromise]);

        // Verify the container is actually functional
        if (!container || typeof container !== 'object') {
          throw new Error('WebContainer initialized but returned invalid object');
        }

        // Test basic WebContainer functionality
        try {
          await container.fs.readdir('.');
        } catch (fsError) {
          console.warn('WebContainer filesystem test failed, but proceeding:', fsError);
        }

        webcontainerContext.loaded = true;
        webcontainerContext.ready = true;
        webcontainerContext.error = undefined;
        webcontainerContext.retryCount = attempt;

        console.log('✅ WebContainer initialized successfully');

        // Dispatch readiness event for FilesStore
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('webcontainer-ready'));
        }

        return container;
      } catch (error) {
        console.error(`❌ WebContainer initialization attempt ${attempt + 1} failed:`, error);
        webcontainerContext.error = error instanceof Error ? error : new Error(String(error));
        webcontainerContext.retryCount = attempt + 1;

        // Enhanced error analysis
        const errorMessage = String(error);
        const isMemoryError = errorMessage.includes('memory') ||
                             errorMessage.includes('Unable to create more instances') ||
                             errorMessage.includes('OutOfMemory') ||
                             errorMessage.includes('RangeError');

        // Always try recovery for any error type (not just memory)
        forceGarbageCollection();

        // If the first attempt failed due to OOM/instances, do not spam retries
        if (attempt === 0 && (isMemoryError || /Unable to create more instances/i.test(errorMessage))) {
          console.log('⛔ Halting further retries due to memory/instance constraint');
          break;
        }

        if (attempt < MAX_RETRY_ATTEMPTS - 1) {
          // Progressive backoff: 1s, 3s, 5s
          const backoffDelay = attempt === 0 ? 1000 : attempt === 1 ? 3000 : 5000;
          console.log(`⏳ Waiting ${backoffDelay}ms before retry...`);
          await sleep(backoffDelay);
        }
      }
    }

    // If we get here, all attempts failed
    console.error('All WebContainer initialization attempts failed');
    webcontainerContext.ready = false;
    webcontainerContext.loaded = false;

    const finalError = new Error('WebContainer initialization failed after all retry attempts');
    webcontainerContext.error = finalError;
    throw finalError;
  } finally {
    isInitializing = false;
  }
}

// Utility to clear WebContainer cache if needed
export function clearWebContainerCache() {
  if (typeof window !== 'undefined') {
    try {
      // Clear any cached WebContainer data
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.includes('webcontainer') || key.includes('bolt')) {
          localStorage.removeItem(key);
        }
      });
      
      // Clear any cached indexedDB data if possible
      if ('indexedDB' in window) {
        try {
          indexedDB.databases?.().then(databases => {
            databases.forEach(db => {
              if (db.name?.includes('webcontainer')) {
                indexedDB.deleteDatabase(db.name);
              }
            });
          });
        } catch (e) {
          console.warn('Could not clear IndexedDB cache:', e);
        }
      }
      
      console.log('WebContainer cache cleared');
    } catch (e) {
      console.warn('Could not clear WebContainer cache:', e);
    }
  }
}

if (!import.meta.env.SSR) {
  console.log('🌐 WebContainer module initializing on client');

  // For debugging: ensure we're in the right environment
  console.log('🌐 Environment check:', {
    isSSR: import.meta.env.SSR,
    hasWindow: typeof window !== 'undefined',
    hasImportMetaHot: !!import.meta.hot
  });

  // Do not auto-reset on startup; preserve user settings to avoid retry loops
  const cachedWebContainer = import.meta.hot?.data.webcontainer;

  // Only reuse cached promise if it exists and hasn't been rejected
  if (cachedWebContainer && cachedWebContainer !== webcontainer) {
    console.log('🌐 Found cached WebContainer promise, checking status...');
    // Check if the cached promise is still viable by attaching a handler
    cachedWebContainer.then(
      (result: WebContainer) => {
        console.log('🌐 Cached WebContainer promise resolved, reusing it');
        // Promise resolved successfully, reuse it
        webcontainer = cachedWebContainer;
      },
      (error: Error) => {
        console.log('🌐 Cached WebContainer promise rejected, creating fresh one:', error.message);
        // Promise was rejected, don't reuse it - create fresh one
        webcontainer = initWebContainer();
      }
    );
  } else {
    console.log('🌐 No cached WebContainer promise, initializing fresh instance');
    webcontainer = initWebContainer();
  }

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}

// Make WebContainer utilities globally available for easy debugging
if (typeof window !== 'undefined') {
  (window as any).enableWebContainer = () => {
    setWebContainerEnabled(true);
    console.log('✅ WebContainer has been re-enabled! Please refresh the page to apply changes.');
  };

  (window as any).disableWebContainer = () => {
    setWebContainerEnabled(false);
    console.log('❌ WebContainer has been disabled. Running in chat-only mode.');
  };

  // Force enable - bypasses all memory checks (for advanced users)
  (window as any).forceEnableWebContainer = () => {
    console.log('⚠️ Force enabling WebContainer - this may cause performance issues if memory is low');

    if (typeof window !== 'undefined') {
      localStorage.removeItem('webcontainer_disabled');
      localStorage.removeItem('memory_constrained');
      webcontainerContext.disabled = false;
      webcontainerContext.memoryConstrained = false;
      webcontainerContext.error = undefined;
      webcontainerContext.retryCount = 0;

      console.log('✅ WebContainer force-enabled! Please refresh the page to apply changes.');
      console.log('💡 If you experience issues, run: window.disableWebContainer() to disable again.');
    }
  };

  (window as any).checkWebContainer = () => {
    const status = checkAndFixWebContainer();
    console.log('WebContainer Status:', status);
    return status;
  };

  (window as any).fixWebContainer = () => {
    const status = checkAndFixWebContainer();
    if (status.canFix) {
      setWebContainerEnabled(true);
      console.log('✅ Fixed WebContainer issue! Please refresh the page.');
      return true;
    } else {
      console.log('ℹ️ WebContainer is already enabled or cannot be fixed automatically.');
      return false;
    }
  };

  // Force reset function - most powerful option
  (window as any).resetWebContainer = () => {
    const success = forceResetWebContainer();
    if (success) {
      console.log('🔄 WebContainer force reset completed! Please refresh the page now.');
      console.log('💡 Tip: You can also run resetWebContainer() anytime to clear all WebContainer settings.');
    }
    return success;
  };

  // Retry WebContainer initialization
  (window as any).retryWebContainer = () => {
    console.log('🔄 Retrying WebContainer initialization...');
    webcontainerContext.error = undefined;
    webcontainerContext.ready = false;
    webcontainerContext.loaded = false;
    webcontainer = initWebContainer();

    // Update HMR cache with new promise
    if (import.meta.hot) {
      import.meta.hot.data.webcontainer = webcontainer;
    }

    return webcontainer;
  };

  // Emergency memory cleanup function
  (window as any).emergencyMemoryCleanup = () => {
    console.log('🚨 Emergency memory cleanup initiated...');

    try {
      // Force garbage collection
      forceGarbageCollection();

      // Clear all caches
      clearWebContainerCache();

      // Clear other potential memory hogs
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            caches.delete(name);
          });
        });
      }

      // Clear localStorage entries that might be large
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.includes('cache') || key.includes('temp') || key.length > 100) {
          localStorage.removeItem(key);
        }
      });

      console.log('✅ Emergency cleanup completed. Memory should be freed.');
      console.log('💡 Check memory status with: window.checkMemory()');
    } catch (error) {
      console.error('❌ Emergency cleanup failed:', error);
    }
  };

  // Comprehensive memory monitoring utilities
  (window as any).checkMemory = () => {
    if (typeof window === 'undefined') return null;

    try {
      const result: any = {
        timestamp: new Date().toISOString(),
        recommendations: []
      };

      // Browser memory info
      if ('memory' in performance && (performance as any).memory) {
        const memory = (performance as any).memory;
        const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
        const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024);
        const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
        const freeMB = Math.round((memory.jsHeapSizeLimit - memory.usedJSHeapSize) / 1024 / 1024);
        const usagePercent = Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100);

        result.browserMemory = {
          used: usedMB + 'MB',
          total: totalMB + 'MB',
          limit: limitMB + 'MB',
          free: freeMB + 'MB',
          usagePercent: usagePercent + '%'
        };

        // Generate recommendations
        if (usagePercent > 90) {
          result.recommendations.push('CRITICAL: Memory usage is very high (>90%). Close other tabs and restart browser.');
        } else if (usagePercent > 80) {
          result.recommendations.push('WARNING: High memory usage (>80%). Consider closing unused tabs.');
        }

        if (freeMB < 300) {
          result.recommendations.push('LOW MEMORY: Less than 300MB free. WebContainer may fail to initialize.');
        }
      }

      // Device memory
      if ('deviceMemory' in navigator) {
        result.deviceMemory = (navigator as any).deviceMemory + 'GB';
        if ((navigator as any).deviceMemory < 4) {
          result.recommendations.push('Low device memory detected. WebContainer performance may be limited.');
        }
      }

      // Hardware concurrency
      if ('hardwareConcurrency' in navigator) {
        result.cpuCores = navigator.hardwareConcurrency;
      }

      result.webContainerEnabled = !webcontainerContext.disabled;
      result.webContainerStatus = webcontainerContext.loaded ? 'Loaded' : webcontainerContext.error ? 'Error' : 'Initializing';

      console.log('🔍 Memory Status:', result);
      if (result.recommendations.length > 0) {
        console.log('💡 Recommendations:', result.recommendations);
      }
      return result;
    } catch (error) {
      console.warn('Could not check memory:', error);
      return null;
    }
  };

  (window as any).forceGC = () => {
    try {
      if ('gc' in window) {
        const before = (window as any).checkMemory?.();
        (window as any).gc();
        console.log('🗑️ Forced garbage collection');

        // Wait a bit for GC to complete
        setTimeout(() => {
          const after = (window as any).checkMemory?.();
          if (before?.browserMemory && after?.browserMemory) {
            const beforeUsed = parseInt(before.browserMemory.used);
            const afterUsed = parseInt(after.browserMemory.used);
            const freed = beforeUsed - afterUsed;
            if (freed > 0) {
              console.log(`✅ Freed ${freed}MB of memory`);
            } else {
              console.log('ℹ️ Garbage collection completed (no significant memory freed)');
            }
          }
        }, 100);
      } else {
        console.log('ℹ️ Garbage collection not available in this browser');
      }
    } catch (error) {
      console.warn('Could not force garbage collection:', error);
    }
  };

  // Comprehensive diagnostic function
  (window as any).diagnoseWebContainer = () => {
    console.log('🔧 WebContainer Diagnostic Report');
    console.log('================================');

    // Memory status
    console.log('\n📊 Memory Analysis:');
    const memoryStatus = (window as any).checkMemory();

    // WebContainer status
    console.log('\n🔧 WebContainer Status:');
    const wcStatus = (window as any).checkWebContainer();
    console.log('Status:', wcStatus);

    // Error analysis
    console.log('\n❌ Recent Errors:');
    if (webcontainerContext.error) {
      console.log('Last error:', webcontainerContext.error.message);
      console.log('Error time:', new Date().toISOString());
    } else {
      console.log('No recent errors');
    }

    // Recommendations
    console.log('\n💡 Recommendations:');
    const recommendations = [];

    if (webcontainerContext.error) {
      recommendations.push('1. WebContainer failed to initialize - this is normal on some systems');
      recommendations.push('2. Run: window.resetWebContainer() to reset all settings');
      recommendations.push('3. Refresh the page after running reset');
    }

    if (memoryStatus?.recommendations) {
      recommendations.push(...memoryStatus.recommendations.map((r: string, i: number) => `${recommendations.length + i + 1}. ${r}`));
    }

    if (recommendations.length === 0) {
      recommendations.push('No issues detected - WebContainer should work normally');
    }

    recommendations.forEach(rec => console.log(rec));

    console.log('\n🚀 Quick Fix Commands:');
    console.log('window.emergencyMemoryCleanup()  // Free memory');
    console.log('window.forceEnableWebContainer()  // Force enable');
    console.log('window.resetWebContainer()        // Reset settings');
    console.log('window.checkMemory()              // Check memory status');

    return {
      memoryStatus,
      webContainerStatus: wcStatus,
      recommendations
    };
  };
}

