import React, { useState } from 'react';
import { Link } from '@remix-run/react';
import { OAuthButtons } from './OAuthButtons';
import { classNames as cn } from '~/utils/classNames';

interface FloatingLoginProps {
  onGoogleLogin?: () => Promise<void> | void;
  onGithubLogin?: () => Promise<void> | void;
  onClose?: () => void;
  className?: string;
}

export function FloatingLogin({
  onGoogleLogin,
  onGithubLogin,
  onClose,
  className
}: FloatingLoginProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    setIsLoading(true);

    try {
      if (provider === 'google' && onGoogleLogin) {
        await onGoogleLogin();
      } else if (provider === 'github' && onGithubLogin) {
        await onGithubLogin();
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-50",
      "w-80 max-w-[calc(100vw-3rem)]",
      "bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-xl",
      "border border-gray-200/50 dark:border-gray-700/50",
      "rounded-2xl shadow-2xl",
      "p-6",
      className
    )}>
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Close"
        >
          <svg
            className="w-4 h-4 text-gray-500 dark:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}

      {/* Header */}
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Welcome to Gleio AI
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sign in to continue your conversation
        </p>
      </div>

      {/* OAuth Buttons */}
      <OAuthButtons
        onGoogleClick={() => handleOAuthLogin('google')}
        onGithubClick={() => handleOAuthLogin('github')}
        isLoading={isLoading}
        className="mb-4"
      />

      {/* Links */}
      <div className="text-center space-y-2">
        <Link
          to="/login"
          className="block text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-medium"
        >
          More sign-in options
        </Link>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          By signing in, you agree to our{' '}
          <a
            href="#"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 underline"
          >
            Terms
          </a>{' '}
          and{' '}
          <a
            href="#"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 underline"
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
