import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Ensure singleton Supabase client in the browser context and use a custom storage key
const globalAny = typeof window !== 'undefined' ? (window as any) : {};

export const supabase = globalAny.__gleio_supabase__ ?? createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'gleio-auth',
  }
})

if (typeof window !== 'undefined') {
  (window as any).__gleio_supabase__ = supabase;
}

// Auth helper functions
export const auth = {
  // Sign up with email and password
  signUp: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { data, error }
  },

  // Sign in with email and password
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  },

  // Sign in with OAuth provider
  signInWithOAuth: async (provider: 'google' | 'github') => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/`
      }
    })

    // Enhanced error handling for OAuth providers
    if (error) {
      console.error(`${provider} OAuth error:`, error);

      // Provide user-friendly error messages
      if (error.message?.includes('not enabled')) {
        const friendlyError = new Error(
          `${provider.charAt(0).toUpperCase() + provider.slice(1)} authentication is not configured. Please contact support or try email authentication instead.`
        );
        return { data, error: friendlyError };
      }

      if (error.message?.includes('redirect')) {
        const friendlyError = new Error(
          `Authentication redirect failed. Please try again or contact support.`
        );
        return { data, error: friendlyError };
      }
    }

    return { data, error }
  },

  // Sign in with magic link
  signInWithMagicLink: async (email: string) => {
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/`
      }
    })
    return { data, error }
  },

  // Sign out
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Get current user
  getCurrentUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  // Get session
  getSession: async () => {
    const { data: { session }, error } = await supabase.auth.getSession()
    return { session, error }
  },

  // Listen to auth state changes
  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// Database helper functions
export const db = {
  // Example: Get user profile
  getUserProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return { data, error }
  },

  // Example: Update user profile
  updateUserProfile: async (userId: string, updates: any) => {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
    return { data, error }
  },

  // Example: Create user profile
  createUserProfile: async (profile: any) => {
    const { data, error } = await supabase
      .from('profiles')
      .insert(profile)
    return { data, error }
  }
}

export default supabase
