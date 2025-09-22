import React, { useState } from 'react';
import { Link, useNavigate } from '@remix-run/react';
import { AuthCard } from './AuthCard';
import { OAuthButtons } from './OAuthButtons';
import { EmailMagicLinkForm } from './EmailMagicLinkForm';

interface SignupPageProps {
  onGoogleSignup?: () => Promise<void> | void;
  onGithubSignup?: () => Promise<void> | void;
  onEmailSignup?: (email: string) => Promise<void> | void;
}

export function SignupPage({
  onGoogleSignup,
  onGithubSignup,
  onEmailSignup
}: SignupPageProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();

  const handleOAuthSignup = async (provider: 'google' | 'github') => {
    setIsLoading(true);
    setError(undefined);

    try {
      if (provider === 'google' && onGoogleSignup) {
        await onGoogleSignup();
      } else if (provider === 'github' && onGithubSignup) {
        await onGithubSignup();
      }
      // Redirect will be handled by the auth provider
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignup = async (email: string) => {
    setIsLoading(true);
    setError(undefined);

    try {
      if (onEmailSignup) {
        await onEmailSignup(email);
        setSuccessMessage(`We've sent a magic link to ${email}. Click the link to complete your account setup.`);
      } else {
        // Mock success for demo
        setSuccessMessage(`We've sent a magic link to ${email}. Click the link to complete your account setup.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-gradient p-4">
      <AuthCard
        title="Create account"
        subtitle="Join Gleio AI to get started"
      >
        <OAuthButtons
          onGoogleClick={() => handleOAuthSignup('google')}
          onGithubClick={() => handleOAuthSignup('github')}
          isLoading={isLoading}
        />

        <EmailMagicLinkForm
          onSubmit={handleEmailSignup}
          isLoading={isLoading}
          error={error}
          successMessage={successMessage}
        />

        <div className="text-center space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            By signing up, you agree to our{' '}
            <a
              href="#"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 underline"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="#"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 underline"
            >
              Privacy Policy
            </a>
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>
      </AuthCard>
    </div>
  );
}
