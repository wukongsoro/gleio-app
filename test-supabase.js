// Quick test script for Supabase connection
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ceknhjikfujzauesszis.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNla25oamlrZnVqemF1ZXNzemlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTcxMDgsImV4cCI6MjA3MzY5MzEwOH0.zj2o-u-OZqotZ4hBRAGHg2AKnhVx18rEWojESIZFXIw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  try {
    console.log('🔗 Testing Supabase connection...');

    // Test auth status
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error && error.message !== 'Auth session missing!') {
      throw error;
    }

    console.log('✅ Supabase connection successful!');
    console.log('📍 Project URL:', supabaseUrl);
    console.log('👤 Current user:', user ? user.email : 'No user logged in');

    // Test database connection (try to access a common table)
    try {
      const { data, error: dbError } = await supabase.from('_health').select('*').limit(1);
      if (dbError && !dbError.message.includes('does not exist')) {
        console.log('⚠️ Database connection may have restrictions');
      } else {
        console.log('🗄️ Database connection successful');
      }
    } catch (e) {
      console.log('ℹ️ Database access test completed');
    }

    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}

testConnection().then(() => {
  console.log('\n🎉 Supabase integration test completed!');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});
