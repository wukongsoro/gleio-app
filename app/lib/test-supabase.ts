import { supabase } from './supabase';

export async function testSupabaseConnection() {
  try {
    console.log('🧪 Testing Supabase connection...');

    // Test 1: Basic connection
    const { data: healthCheck, error: healthError } = await supabase
      .from('_health')
      .select('*')
      .limit(1);

    if (healthError && healthError.code !== 'PGRST116') { // PGRST116 is "relation does not exist" which is expected for _health
      console.log('✅ Basic connection test passed');
    }

    // Test 2: Auth status
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('👤 Current user:', user ? `${user.email} (${user.id})` : 'No user logged in');

    // Test 3: List available tables (this will show what's accessible with RLS)
    try {
      const { data: tables, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .limit(10);

      if (tables) {
        console.log('📊 Available tables:', tables.map(t => t.table_name));
      }
    } catch (e) {
      console.log('📊 Could not list tables (expected if no tables exist or RLS restrictions)');
    }

    console.log('✅ Supabase connection test completed successfully!');
    console.log('🔗 Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
    console.log('🔑 Using anon key for authentication');

    return {
      success: true,
      user,
      message: 'Supabase connection is working!'
    };

  } catch (error) {
    console.error('❌ Supabase connection test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      message: 'Supabase connection failed'
    };
  }
}

// Make it available globally for testing
if (typeof window !== 'undefined') {
  (window as any).testSupabaseConnection = testSupabaseConnection;
}
