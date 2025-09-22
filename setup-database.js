#!/usr/bin/env node

// Database Setup Script for ChatGPT-style Settings
// This script guides you through setting up the Supabase database

console.log('🚀 ChatGPT-Style Settings Database Setup\n');

console.log('📋 This script will help you set up the database schema for your settings page.\n');

console.log('📁 Files created:');
console.log('   ✅ supabase/migrations/001_initial_schema.sql - Database schema');
console.log('   ✅ supabase/seed.sql - Sample data for testing');
console.log('   ✅ supabase/check-setup.js - Database verification script');
console.log('   ✅ supabase/README.md - Detailed setup instructions\n');

console.log('🔧 Setup Steps:\n');

console.log('1. 📊 Access Supabase Dashboard');
console.log('   Go to: https://supabase.com/dashboard/project/ceknhjikfujzauesszis');
console.log('   Navigate to: SQL Editor\n');

console.log('2. 🏃‍♂️ Run the Migration');
console.log('   Copy the contents of: supabase/migrations/001_initial_schema.sql');
console.log('   Paste into SQL Editor and click "Run"\n');

console.log('3. ✅ Verify Setup');
console.log('   Option A (Recommended):');
console.log('   pnpm run db:check');
console.log('');
console.log('   Option B (Manual):');
console.log('   Run: node supabase/check-setup.js\n');

console.log('4. 🎯 Test Your Settings Page');
console.log('   Visit: http://localhost:5173/settings');
console.log('   You should see your profile, usage data, and billing information!\n');

console.log('📊 Database Schema Created:');
console.log('   • profiles - User profile information');
console.log('   • subscriptions - Stripe subscription data');
console.log('   • invoices - Billing invoice history');
console.log('   • usage_counters - Token usage tracking');
console.log('   • get_user_usage() - Usage summary function\n');

console.log('🔒 Security Features:');
console.log('   • Row Level Security (RLS) enabled');
console.log('   • Users can only access their own data');
console.log('   • Automatic profile creation on signup\n');

console.log('⚡ Real-time Features:');
console.log('   • Live token usage updates');
console.log('   • Subscription status changes');
console.log('   • Profile information sync\n');

console.log('🎉 Once you complete the setup, your settings page will work perfectly!');
console.log('📖 For detailed instructions, see: supabase/README.md\n');

console.log('❓ Need help? Check the troubleshooting section in the README.\n');

// Check if the migration file exists
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationPath = path.join(__dirname, 'supabase', 'migrations', '001_initial_schema.sql');

if (fs.existsSync(migrationPath)) {
  console.log('✅ Migration file found at:', migrationPath);
  console.log('📄 File size:', fs.statSync(migrationPath).size, 'bytes\n');
} else {
  console.log('❌ Migration file not found. Please check the file structure.\n');
}

console.log('🎯 Ready to proceed? Run the migration in your Supabase dashboard!');
