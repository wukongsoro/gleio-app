import React from 'react';
import { IconButton } from './IconButton';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{error: Error; retry: () => void}>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback } = this.props;
      
      if (Fallback && this.state.error) {
        return <Fallback error={this.state.error} retry={this.handleRetry} />;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-6 bg-conformity-elements-background-depth-1 border border-conformity-elements-borderColor rounded-lg">
          <div className="i-ph:warning-circle text-6xl text-conformity-elements-accent-primary mb-4" />
          <h2 className="text-xl font-semibold text-conformity-elements-textPrimary mb-2">
            Something went wrong
          </h2>
          <p className="text-conformity-elements-textSecondary text-center mb-4 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred. This might be due to memory limitations.'}
          </p>
          <div className="flex gap-2">
            <IconButton
              icon="i-ph:arrow-clockwise"
              onClick={this.handleRetry}
              className="bg-conformity-elements-accent-primary text-white hover:bg-conformity-elements-accent-primary/80"
            >
              Retry
            </IconButton>
            <IconButton
              icon="i-ph:browser"
              onClick={() => window.location.reload()}
              variant="secondary"
            >
              Reload Page
            </IconButton>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800 max-w-full overflow-auto">
              <summary className="cursor-pointer font-medium">Error Details</summary>
              <pre className="mt-2 whitespace-pre-wrap">{this.state.error.stack}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// WebContainer-specific error fallback
export const WebContainerErrorFallback: React.FC<{error: Error; retry: () => void}> = ({ error, retry }) => {
  const isMemoryError = error.message.includes('memory') || 
                        error.message.includes('Unable to create more instances') ||
                        error.message.includes('disabled due to memory constraints');
  const isDisabled = error.message.includes('disabled');
  
  const handleEnableWebContainer = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('webcontainer_disabled');
      window.location.reload();
    }
  };
  
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 bg-conformity-elements-background-depth-1 border border-conformity-elements-borderColor rounded-lg">
      <div className="i-ph:chat-circle text-6xl text-conformity-elements-accent-primary mb-4" />
      <h2 className="text-xl font-semibold text-conformity-elements-textPrimary mb-2">
        {isDisabled ? 'Chat-Only Mode' : 'WebContainer Unavailable'}
      </h2>
      <p className="text-conformity-elements-textSecondary text-center mb-4 max-w-md">
        {isMemoryError 
          ? 'Running in chat-only mode due to memory limitations. You can still use the AI assistant for conversations, explanations, and code help.'
          : 'WebContainer features are temporarily unavailable. Chat functionality remains fully operational.'
        }
      </p>
      
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 max-w-md">
        <p className="font-medium mb-2">✨ Chat-Only Features Available:</p>
        <ul className="space-y-1 text-xs">
          <li>• AI conversations and assistance</li>
          <li>• Code explanations and reviews</li>
          <li>• Technical guidance and debugging</li>
          <li>• Architecture and design advice</li>
          <li>• Learning and educational content</li>
        </ul>
      </div>
      
      <div className="flex gap-2 mb-4">
        {!isDisabled && (
          <IconButton
            icon="i-ph:arrow-clockwise"
            onClick={retry}
            className="bg-conformity-elements-accent-primary text-white hover:bg-conformity-elements-accent-primary/80"
          >
            Retry
          </IconButton>
        )}
        {isDisabled && (
          <IconButton
            icon="i-ph:cpu"
            onClick={handleEnableWebContainer}
            className="bg-conformity-elements-accent-primary text-white hover:bg-conformity-elements-accent-primary/80"
          >
            Try Enable WebContainer
          </IconButton>
        )}
        <IconButton
          icon="i-ph:browser"
          onClick={() => window.location.reload()}
          variant="secondary"
        >
          Reload Page
        </IconButton>
      </div>
      
      {isMemoryError && (
        <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700 max-w-md">
          <p className="font-medium mb-1">💡 Memory Optimization Tips:</p>
          <p>Close other browser tabs, restart your browser, or try a desktop browser for full WebContainer support.</p>
        </div>
      )}
    </div>
  );
};
