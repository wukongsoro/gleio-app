// Simple Node.js script to verify Supabase database setup
// Run with: node supabase/check-setup.js

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Get environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Make sure you have VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSetup() {
  console.log('🔍 Checking Supabase database setup...\n');

  const checks = [
    {
      name: 'profiles table',
      query: () => supabase.from('profiles').select('count').limit(1),
      description: 'User profile information storage'
    },
    {
      name: 'subscriptions table',
      query: () => supabase.from('subscriptions').select('count').limit(1),
      description: 'Stripe subscription data storage'
    },
    {
      name: 'invoices table',
      query: () => supabase.from('invoices').select('count').limit(1),
      description: 'Billing invoice storage'
    },
    {
      name: 'usage_counters table',
      query: () => supabase.from('usage_counters').select('count').limit(1),
      description: 'Token usage tracking'
    },
    {
      name: 'get_user_usage function',
      query: () => supabase.rpc('get_user_usage', { user_id: '00000000-0000-0000-0000-000000000000' }),
      description: 'User usage summary function'
    }
  ];

  let allPassed = true;

  for (const check of checks) {
    try {
      const result = await check.query();

      if (result.error) {
        if (result.error.message.includes('does not exist') ||
            result.error.message.includes('function') && result.error.message.includes('does not exist')) {
          console.log(`❌ ${check.name} - MISSING`);
          console.log(`   ${check.description}`);
          console.log(`   Error: ${result.error.message}\n`);
          allPassed = false;
        } else {
          console.log(`⚠️  ${check.name} - EXISTS but may have issues`);
          console.log(`   ${check.description}`);
          console.log(`   Note: ${result.error.message}\n`);
        }
      } else {
        console.log(`✅ ${check.name} - OK`);
        console.log(`   ${check.description}\n`);
      }
    } catch (error) {
      console.log(`❌ ${check.name} - ERROR`);
      console.log(`   ${check.description}`);
      console.log(`   Error: ${error.message}\n`);
      allPassed = false;
    }
  }

  console.log('='.repeat(50));

  if (allPassed) {
    console.log('🎉 All database components are properly set up!');
    console.log('Your settings page should work correctly now.');
  } else {
    console.log('⚠️  Some database components are missing.');
    console.log('Please run the migration script: supabase/migrations/001_initial_schema.sql');
    console.log('\n📖 For detailed setup instructions, see: supabase/README.md');
  }

  console.log('\n🔗 Supabase Project URL:', supabaseUrl);
}

checkSetup().catch(error => {
  console.error('❌ Setup check failed:', error.message);
  process.exit(1);
});
