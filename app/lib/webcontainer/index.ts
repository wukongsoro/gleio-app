import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';

interface WebContainerContext {
  loaded: boolean;
  error?: Error;
  retryCount: number;
  disabled: boolean;
  memoryConstrained: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
  retryCount: 0,
  disabled: false,
  memoryConstrained: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

const MAX_RETRY_ATTEMPTS = 1; // Single attempt to prevent memory exhaustion
const RETRY_DELAY = 5000; // Longer delay to allow memory recovery
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

// Check if WebContainer should be disabled
function shouldDisableWebContainer(): boolean {
  // Check environment variable or localStorage setting
  if (typeof window !== 'undefined') {
    const disabledByUser = localStorage.getItem('webcontainer_disabled') === 'true';
    if (disabledByUser) {
      console.log('WebContainer disabled by user setting');
      return true;
    }
  }

  // Check if already marked as memory constrained
  if (webcontainerContext.memoryConstrained) {
    console.log('WebContainer disabled due to previous memory constraints');
    return true;
  }

  // Detect current memory constraints
  const memoryConstrained = detectMemoryConstraints();
  if (memoryConstrained) {
    webcontainerContext.memoryConstrained = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem('webcontainer_disabled', 'true');
    }
    return true;
  }

  return false;
}

// Allow manual enabling/disabling of WebContainer
export function setWebContainerEnabled(enabled: boolean) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('webcontainer_disabled', (!enabled).toString());
    webcontainerContext.disabled = !enabled;

    if (enabled) {
      webcontainerContext.memoryConstrained = false;
      // Clear any related cache entries
      localStorage.removeItem('memory_constrained');
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
  const memoryConstrained = localStorage.getItem('memory_constrained') === 'true';

  if (disabledByUser || memoryConstrained) {
    return {
      enabled: false,
      status: disabledByUser ? 'Disabled by user' : 'Disabled due to memory constraints',
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
    // Clear all WebContainer related localStorage entries
    localStorage.removeItem('webcontainer_disabled');
    localStorage.removeItem('memory_constrained');
    localStorage.removeItem('bolt_webcontainer_error');

    // Reset context state
    webcontainerContext.disabled = false;
    webcontainerContext.memoryConstrained = false;
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
  // Check if WebContainer should be disabled due to memory constraints
  const shouldDisable = shouldDisableWebContainer();
  if (shouldDisable) {
    webcontainerContext.disabled = true;
    const error = new Error('WebContainer disabled due to memory constraints or user setting');
    webcontainerContext.error = error;
    console.log('WebContainer initialization skipped - running in chat-only mode');

    // Emit event for UI components to react
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('webcontainer-error', {
        detail: {
          message: 'WebContainer disabled due to memory constraints or user setting',
          reason: webcontainerContext.memoryConstrained ? 'memory' : 'user_setting',
          canFix: true,
          fixInstructions: 'To re-enable WebContainer, run: window.enableWebContainer() in the browser console, then refresh the page.'
        }
      });
      window.dispatchEvent(event);
    }

    throw error;
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

      // Final memory check after cleanup
      const stillConstrained = detectMemoryConstraints();
      if (stillConstrained) {
        console.warn('Memory constraints persist after cleanup - proceeding with caution');
      }
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
        webcontainerContext.error = undefined;
        webcontainerContext.retryCount = attempt;

        console.log('✅ WebContainer initialized successfully');
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

        if (isMemoryError) {
          console.warn('💾 Memory error detected - attempting recovery');

          // Try aggressive memory cleanup
          forceGarbageCollection();

          // Wait longer for memory to recover
          await sleep(RETRY_DELAY * 2);

          // Check if memory situation improved
          const stillConstrained = detectMemoryConstraints();
          if (!stillConstrained) {
            console.log('Memory situation improved - retrying...');
            continue;
          }

          // If still constrained after cleanup, disable but allow manual override
          console.warn('Memory constraints persist - disabling WebContainer but allowing manual override');
          webcontainerContext.memoryConstrained = true;
          if (typeof window !== 'undefined') {
            localStorage.setItem('memory_constrained', 'true');

            // Emit detailed error event with recovery options
            const event = new CustomEvent('webcontainer-error', {
              detail: {
                message: 'WebContainer failed due to memory constraints',
                reason: 'memory_error',
                canFix: true,
                error: errorMessage,
                fixInstructions: 'Options:\n1. Close other browser tabs and refresh\n2. Run: window.forceEnableWebContainer() for manual override\n3. Run: window.checkMemory() to see current memory status'
              }
            });
            window.dispatchEvent(event);
          }
          throw new Error('WebContainer disabled due to memory constraints');
        }

        // For non-memory errors, try again after cleanup
        forceGarbageCollection();

        if (attempt < MAX_RETRY_ATTEMPTS - 1) {
          console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
          await sleep(RETRY_DELAY);
        }
      }
    }

    // If we get here, all attempts failed
    console.error('All WebContainer initialization attempts failed');
    webcontainerContext.disabled = true;

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
  // Do not auto-reset on startup; preserve user settings to avoid retry loops
  webcontainer = import.meta.hot?.data.webcontainer ?? initWebContainer();

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
      result.memoryConstrained = webcontainerContext.memoryConstrained;
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

    if (webcontainerContext.memoryConstrained) {
      recommendations.push('1. Memory constraints detected - try closing other browser tabs');
      recommendations.push('2. Run: window.emergencyMemoryCleanup() to free memory');
      recommendations.push('3. Run: window.forceEnableWebContainer() to bypass memory checks');
    }

    if (webcontainerContext.error) {
      recommendations.push('4. Run: window.resetWebContainer() to reset all settings');
      recommendations.push('5. Refresh the page after running reset');
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

