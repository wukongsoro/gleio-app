import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

export interface ParsedError {
  id: string;
  type: 'module-not-found' | 'next-font' | 'typescript' | 'runtime' | 'build' | 'unknown';
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
  fullError: string;
  timestamp: number;
}

interface ErrorPanelProps {
  errors: string[];
  onFixError: (error: ParsedError) => void;
  isFixing?: boolean;
}

function parseError(errorText: string, index: number): ParsedError {
  const id = `error-${index}-${Date.now()}`;
  const timestamp = Date.now();
  
  // Parse module not found errors
  const moduleNotFoundMatch = errorText.match(/Module not found: Can't resolve ['"](.+?)['"]/);
  if (moduleNotFoundMatch) {
    const modulePath = moduleNotFoundMatch[1];
    const fileMatch = errorText.match(/\n\s+(\d+)\s+\|/);
    const lineNumber = fileMatch ? parseInt(fileMatch[1], 10) : undefined;
    
    return {
      id,
      type: 'module-not-found',
      message: `Missing component: ${modulePath}`,
      file: modulePath,
      line: lineNumber,
      suggestion: `Create the missing component file at ${modulePath}`,
      fullError: errorText,
      timestamp,
    };
  }

  // Parse next/font errors
  if (errorText.includes('An error occurred in `next/font`')) {
    const fileMatch = errorText.match(/app\/([\w/.]+\.tsx?)/);
    return {
      id,
      type: 'next-font',
      message: 'Error loading Google Font (next/font)',
      file: fileMatch ? `app/${fileMatch[1]}` : 'app/layout.tsx',
      suggestion: 'Fix font import configuration for WebContainer compatibility',
      fullError: errorText,
      timestamp,
    };
  }

  // Parse TypeScript errors
  const tsErrorMatch = errorText.match(/error TS(\d+): (.+)/);
  if (tsErrorMatch) {
    return {
      id,
      type: 'typescript',
      message: `TypeScript: ${tsErrorMatch[2]}`,
      suggestion: 'Fix type error',
      fullError: errorText,
      timestamp,
    };
  }

  // Parse webpack/build errors
  if (errorText.includes('[webpack') || errorText.includes('PackFileCacheStrategy')) {
    return {
      id,
      type: 'build',
      message: 'Build cache issue (can be ignored)',
      suggestion: 'This is a non-critical webpack caching warning',
      fullError: errorText,
      timestamp,
    };
  }

  // Generic error
  return {
    id,
    type: 'unknown',
    message: errorText.slice(0, 100) + (errorText.length > 100 ? '...' : ''),
    suggestion: 'Review and fix this error',
    fullError: errorText,
    timestamp,
  };
}

function ErrorItem({ error, onFix, isFixing }: { 
  error: ParsedError; 
  onFix: () => void;
  isFixing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const getErrorIcon = () => {
    switch (error.type) {
      case 'module-not-found':
        return '📦';
      case 'next-font':
        return '🔤';
      case 'typescript':
        return '⚠️';
      case 'build':
        return '🔧';
      default:
        return '❌';
    }
  };

  const isCritical = error.type !== 'build';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={classNames(
        'border-l-4 p-3 mb-2 rounded-r',
        isCritical ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-yellow-500'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{getErrorIcon()}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={classNames(
              'text-xs font-semibold uppercase px-2 py-0.5 rounded',
              isCritical ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
            )}>
              {error.type.replace('-', ' ')}
            </span>
            {error.file && (
              <span className="text-xs text-gray-600 font-mono truncate">
                {error.file}{error.line ? `:${error.line}` : ''}
              </span>
            )}
          </div>
          
          <p className="text-sm font-medium text-gray-900 mb-1">
            {error.message}
          </p>
          
          {error.suggestion && (
            <p className="text-xs text-gray-600 mb-2">
              💡 {error.suggestion}
            </p>
          )}

          <div className="flex items-center gap-2">
            {isCritical && (
              <button
                onClick={onFix}
                disabled={isFixing}
                className={classNames(
                  'px-3 py-1.5 text-xs font-medium rounded transition-colors',
                  isFixing
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                {isFixing ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Fixing...
                  </span>
                ) : (
                  '🔧 Fix This Error'
                )}
              </button>
            )}
            
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              {expanded ? '▼ Hide details' : '▶ Show details'}
            </button>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.pre
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 p-2 bg-gray-900 text-gray-100 text-xs rounded overflow-x-auto"
              >
                {error.fullError}
              </motion.pre>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

export const ErrorPanel = memo(({ errors, onFixError, isFixing = false }: ErrorPanelProps) => {
  const parsedErrors = errors
    .map((error, index) => parseError(error, index))
    .filter(error => error.type !== 'build'); // Filter out non-critical build warnings

  if (parsedErrors.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border-t border-gray-200 max-h-64 overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">
            🚨 Errors Detected ({parsedErrors.length})
          </span>
        </div>
        <span className="text-xs text-gray-500">
          Click "Fix This Error" to auto-resolve
        </span>
      </div>
      
      <div className="p-4">
        <AnimatePresence>
          {parsedErrors.map((error) => (
            <ErrorItem
              key={error.id}
              error={error}
              onFix={() => onFixError(error)}
              isFixing={isFixing}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
});

ErrorPanel.displayName = 'ErrorPanel';

