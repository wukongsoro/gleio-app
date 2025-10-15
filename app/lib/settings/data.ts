// Framework-agnostic settings data layer
// Uses Supabase for data operations and real-time subscriptions

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'unpaid';
  plan_name: string;
  plan_id: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsageSummary {
  daily_used: number;
  daily_limit: number;
  monthly_used: number;
  monthly_limit: number;
  next_refill_date: string;
  last_updated: string;
}

export interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'draft';
  created_at: string;
  description?: string;
  hosted_invoice_url?: string;
}

export class SettingsDataLayer {
  private supabase: any = null;
  private realtimeChannel: any = null;
  private eventListeners: Map<string, Set<Function>> = new Map();
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.initializeSupabase();
  }

  private async initializeSupabase() {
    try {
      // Reuse the singleton client to avoid multiple GoTrue instances
      const { supabase } = await import('~/lib/supabase');
      this.supabase = supabase;
      this.setupRealtimeSubscriptions();
    } catch (error) {
      console.error('Failed to initialize Supabase:', error);
      // Don't throw, just log and continue with limited functionality
    }
  }

  private async ensureInitialized() {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeSupabase();
    }

    await this.initializationPromise;
  }

  private setupRealtimeSubscriptions() {
    if (!this.supabase) return;

    // Subscribe to profile changes
    this.realtimeChannel = this.supabase
      .channel('settings-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles'
      }, (payload: any) => {
        this.emit('profile-update', payload);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'subscriptions'
      }, (payload: any) => {
        this.emit('subscription-update', payload);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'usage_counters'
      }, (payload: any) => {
        this.emit('usage-update', payload);
      })
      .subscribe();
  }

  // Event emitter pattern for real-time updates
  on(event: string, callback: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.delete(callback);
    }
  }

  private emit(event: string, data: any) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }

  // Data fetching methods
  async getProfile(): Promise<{ data: UserProfile | null; error: string | null }> {
    try {
      await this.ensureInitialized();

      if (!this.supabase) {
        return {
          data: null,
          error: 'Supabase configuration missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
        };
      }

      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        return { data: null, error: 'Not authenticated' };
      }

      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          // Try to create profile if it doesn't exist
          const profileData = {
            id: user.id,
            name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
            email: user.email || '',
            avatar_url: user.user_metadata?.avatar_url,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { data: newProfile, error: insertError } = await this.supabase
            .from('profiles')
            .insert(profileData)
            .select()
            .single();

          if (insertError) {
            // Check if it's a table not found error
            if (insertError.message?.includes('relation "public.profiles" does not exist')) {
              return {
                data: {
                  id: user.id,
                  name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
                  email: user.email || '',
                  avatar_url: user.user_metadata?.avatar_url,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                error: 'Database not set up. Please run the Supabase migration at supabase/migrations/001_initial_schema.sql'
              };
            }
            return { data: null, error: insertError.message };
          }

          return { data: newProfile, error: null };
        }

        // Check for table not found error
        if (error.message?.includes('relation "public.profiles" does not exist')) {
          return {
            data: {
              id: user.id,
              name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
              email: user.email || '',
              avatar_url: user.user_metadata?.avatar_url,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            error: 'Database not set up. Please run the Supabase migration at supabase/migrations/001_initial_schema.sql'
          };
        }

        return { data: null, error: error.message };
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async updateProfile(updates: { name?: string; avatar_url?: string }): Promise<{ data: UserProfile | null; error: string | null }> {
    try {
      await this.ensureInitialized();

      if (!this.supabase) throw new Error('Supabase not initialized');

      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        return { data: null, error: 'Not authenticated' };
      }

      const { data, error } = await this.supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        return { data: null, error: error.message };
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getSubscription(): Promise<{ data: Subscription | null; error: string | null }> {
    try {
      await this.ensureInitialized();

      if (!this.supabase) {
        return {
          data: null,
          error: 'Supabase configuration missing. Subscription data unavailable.',
        };
      }

      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        return { data: null, error: 'Not authenticated' };
      }

      const { data, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        return { data: null, error: error.message };
      }

      return { data: data || null, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getUsageSummary(): Promise<{ data: UsageSummary | null; error: string | null }> {
    try {
      await this.ensureInitialized();

      if (!this.supabase) {
        return {
          data: null,
          error: 'Supabase configuration missing. Usage data unavailable.',
        };
      }

      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        return { data: null, error: 'Not authenticated' };
      }

      // Get current subscription to determine limits
      const { data: subscription } = await this.getSubscription();

      // Default limits for free users
      let dailyLimit = 50000;
      let monthlyLimit = 1000000;

      if (subscription?.status === 'active') {
        // Set limits based on plan
        switch (subscription.plan_id) {
          case 'pro_monthly':
            dailyLimit = 1000000; // No daily limit for pro
            monthlyLimit = 10000000;
            break;
          case 'pro_yearly':
            dailyLimit = 1000000;
            monthlyLimit = 10000000;
            break;
        }
      }

      // Get usage from v_user_usage view
      const { data: usageData, error } = await this.supabase
        .rpc('get_user_usage', { user_id: user.id });

      if (error) {
        console.warn('Usage view not available, using defaults');
      }

      const dailyUsed = usageData?.daily_used || 0;
      const monthlyUsed = usageData?.monthly_used || 0;

      // Calculate next refill date (first day of next month)
      const now = new Date();
      const nextRefill = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      return {
        data: {
          daily_used: dailyUsed,
          daily_limit: dailyLimit,
          monthly_used: monthlyUsed,
          monthly_limit: monthlyLimit,
          next_refill_date: nextRefill.toISOString(),
          last_updated: new Date().toISOString(),
        },
        error: null
      };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getRecentInvoices(limit = 3): Promise<{ data: Invoice[]; error: string | null }> {
    try {
      await this.ensureInitialized();

      if (!this.supabase) {
        return {
          data: [],
          error: 'Supabase configuration missing. Invoice data unavailable.',
        };
      }

      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        return { data: [], error: 'Not authenticated' };
      }

      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        return { data: [], error: error.message };
      }

      return { data: data || [], error: null };
    } catch (error) {
      return { data: [], error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Cleanup method
  destroy() {
    if (this.realtimeChannel) {
      this.supabase.removeChannel(this.realtimeChannel);
    }
    this.eventListeners.clear();
  }
}

// Factory function to create data layer instance
export function createSettingsDataLayer() {
  return new SettingsDataLayer();
}

// Export a getter function that creates instance on demand
let dataLayerInstance: SettingsDataLayer | null = null;

export function getSettingsDataLayer() {
  if (!dataLayerInstance) {
    dataLayerInstance = new SettingsDataLayer();
  }
  return dataLayerInstance;
}
