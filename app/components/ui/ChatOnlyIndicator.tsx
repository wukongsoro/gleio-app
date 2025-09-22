import { useState, useEffect } from 'react';

export function ChatOnlyIndicator() {
  const [isDisabled, setIsDisabled] = useState(false);
  const [isMemoryConstrained, setIsMemoryConstrained] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check if WebContainer is disabled
      const disabled = localStorage.getItem('webcontainer_disabled') === 'true';
      setIsDisabled(disabled);
      
      // Check dismissal state
      const dismissed = sessionStorage.getItem('chat_only_dismissed') === 'true';
      setIsDismissed(dismissed);
      
      // Check for memory constraints by looking for error indicators
      const checkMemoryConstraints = () => {
        // Check if we've seen memory errors in console
        const memoryConstrained = disabled || 
          document.querySelector('[data-memory-error]') !== null ||
          localStorage.getItem('memory_constrained') === 'true';
        setIsMemoryConstrained(memoryConstrained);
      };
      
      checkMemoryConstraints();
      
      // Listen for WebContainer initialization failures
      const handleWebContainerError = (event: any) => {
        try {
          const detail = event.detail;
          if (detail && typeof detail === 'object' && detail.reason) {
            // Handle structured error detail
            if (detail.reason === 'memory' || detail.reason === 'memory_error' ||
                (detail.message && detail.message.includes('memory'))) {
              setIsMemoryConstrained(true);
              setIsDisabled(true);
              localStorage.setItem('memory_constrained', 'true');
            }
          } else if (typeof detail === 'string') {
            // Handle string error detail (legacy support)
            if (detail.includes('memory') || detail.includes('Unable to create more instances')) {
              setIsMemoryConstrained(true);
              setIsDisabled(true);
              localStorage.setItem('memory_constrained', 'true');
            }
          }
        } catch (error) {
          console.warn('Error handling WebContainer error event:', error);
          // Fallback: assume memory issue if we can't parse the error
          setIsMemoryConstrained(true);
          setIsDisabled(true);
          localStorage.setItem('memory_constrained', 'true');
        }
      };
      
      window.addEventListener('webcontainer-error', handleWebContainerError);
      return () => window.removeEventListener('webcontainer-error', handleWebContainerError);
    }
  }, []);

  const handleEnableWebContainer = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('webcontainer_disabled');
      localStorage.removeItem('memory_constrained');
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('chat_only_dismissed', 'true');
    }
  };

  if (!isDisabled || isDismissed) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="i-ph:chat-circle text-blue-600 dark:text-blue-400 text-lg flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
              Chat-Only Mode
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
              {isMemoryConstrained 
                ? 'WebContainer disabled due to memory constraints.'
                : 'WebContainer features unavailable.'
              }
            </p>
            <div className="flex gap-1">
              <button
                onClick={handleEnableWebContainer}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors"
              >
                Try Enable
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 px-2 py-1 rounded transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
