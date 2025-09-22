import React, { useState } from 'react';
import { Link, useNavigate } from '@remix-run/react';
import { AuthCard } from './AuthCard';
import { OAuthButtons } from './OAuthButtons';
import { EmailMagicLinkForm } from './EmailMagicLinkForm';

interface LoginPageProps {
  onGoogleLogin?: () => Promise<void> | void;
  onGithubLogin?: () => Promise<void> | void;
  onEmailLogin?: (email: string) => Promise<void> | void;
}

export function LoginPage({
  onGoogleLogin,
  onGithubLogin,
  onEmailLogin
}: LoginPageProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    setIsLoading(true);
    setError(undefined);

    try {
      if (provider === 'google' && onGoogleLogin) {
        await onGoogleLogin();
      } else if (provider === 'github' && onGithubLogin) {
        await onGithubLogin();
      }
      // Redirect will be handled by the auth provider
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (email: string) => {
    setIsLoading(true);
    setError(undefined);

    try {
      if (onEmailLogin) {
        await onEmailLogin(email);
        setSuccessMessage(`We've sent a magic link to ${email}. Click the link to sign in.`);
      } else {
        // Mock success for demo
        setSuccessMessage(`We've sent a magic link to ${email}. Click the link to sign in.`);
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
        title="Welcome back"
        subtitle="Sign in to your account"
      >
        <OAuthButtons
          onGoogleClick={() => handleOAuthLogin('google')}
          onGithubClick={() => handleOAuthLogin('github')}
          isLoading={isLoading}
        />

        <EmailMagicLinkForm
          onSubmit={handleEmailLogin}
          isLoading={isLoading}
          error={error}
          successMessage={successMessage}
        />

        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{' '}
            <Link
              to="/signup"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-medium"
            >
              Sign up
            </Link>
          </p>
        </div>
      </AuthCard>
    </div>
  );
}
