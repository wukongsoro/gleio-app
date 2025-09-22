import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { SignupPage } from '~/components/auth';

export const meta: MetaFunction = () => {
  return [
    { title: 'Sign Up - Gleio AI' },
    { name: 'description', content: 'Create your Gleio AI account' },
  ];
};

export const loader = () => json({});

// Supabase authentication handlers
const handleGoogleSignup = async () => {
  const { auth } = await import('~/lib/supabase');
  const { error } = await auth.signInWithOAuth('google');
  if (error) {
    console.error('Google signup error:', error.message);
    // Show user-friendly error message
    alert(error.message || 'Google authentication failed. Please try again.');
    throw error;
  }
  // OAuth will handle the redirect automatically
};

const handleGithubSignup = async () => {
  const { auth } = await import('~/lib/supabase');
  const { error } = await auth.signInWithOAuth('github');
  if (error) {
    console.error('GitHub signup error:', error.message);
    // Show user-friendly error message
    alert(error.message || 'GitHub authentication failed. Please try again.');
    throw error;
  }
  // OAuth will handle the redirect automatically
};

const handleEmailSignup = async (email: string) => {
  const { auth } = await import('~/lib/supabase');
  const { error } = await auth.signInWithMagicLink(email);
  if (error) {
    console.error('Email signup error:', error.message);
    throw error;
  }
};

export default function Signup() {
  return (
    <ClientOnly fallback={<div>Loading...</div>}>
      {() => (
        <SignupPage
          onGoogleSignup={handleGoogleSignup}
          onGithubSignup={handleGithubSignup}
          onEmailSignup={handleEmailSignup}
        />
      )}
    </ClientOnly>
  );
}
