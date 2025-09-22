import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { LoginPage } from '~/components/auth';

export const meta: MetaFunction = () => {
  return [
    { title: 'Sign In - Gleio AI' },
    { name: 'description', content: 'Sign in to your Gleio AI account' },
  ];
};

export const loader = () => json({});

// Supabase authentication handlers
const handleGoogleLogin = async () => {
  const { auth } = await import('~/lib/supabase');
  const { error } = await auth.signInWithOAuth('google');
  if (error) {
    console.error('Google login error:', error.message);
    // Show user-friendly error message
    alert(error.message || 'Google authentication failed. Please try again.');
    throw error;
  }
  // OAuth will handle the redirect automatically
};

const handleGithubLogin = async () => {
  const { auth } = await import('~/lib/supabase');
  const { error } = await auth.signInWithOAuth('github');
  if (error) {
    console.error('GitHub login error:', error.message);
    // Show user-friendly error message
    alert(error.message || 'GitHub authentication failed. Please try again.');
    throw error;
  }
  // OAuth will handle the redirect automatically
};

const handleEmailLogin = async (email: string) => {
  const { auth } = await import('~/lib/supabase');
  const { error } = await auth.signInWithMagicLink(email);
  if (error) {
    console.error('Email login error:', error.message);
    throw error;
  }
};

export default function Login() {
  return (
    <ClientOnly fallback={<div>Loading...</div>}>
      {() => (
        <LoginPage
          onGoogleLogin={handleGoogleLogin}
          onGithubLogin={handleGithubLogin}
          onEmailLogin={handleEmailLogin}
        />
      )}
    </ClientOnly>
  );
}
