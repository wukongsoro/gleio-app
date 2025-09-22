# Supabase Database Setup

This directory contains the database schema and setup instructions for the ChatGPT-style settings functionality.

## 🚀 Quick Setup

### 1. Access Supabase Dashboard

Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/ceknhjikfujzauesszis) and navigate to the SQL Editor.

### 2. Run the Migration

Copy and paste the contents of `migrations/001_initial_schema.sql` into the SQL Editor and click "Run".

### 3. Verify Setup

#### Option A: Automated Check (Recommended)

Run the automated check script:

```bash
# Make sure you're in the project root
cd /path/to/your/project

# Install dependencies if needed
pnpm install

# Run the setup check
node supabase/check-setup.js
```

#### Option B: Manual SQL Queries

Or run these queries manually in the Supabase SQL Editor:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE';

-- Check functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_type = 'FUNCTION';
```

## 📋 Database Schema

### Tables Created

1. **`profiles`** - User profile information
   - `id` - UUID (references auth.users)
   - `name` - User's display name
   - `email` - User's email
   - `avatar_url` - Profile picture URL
   - `created_at`, `updated_at` - Timestamps

2. **`subscriptions`** - Stripe subscription data
   - `id` - UUID primary key
   - `user_id` - UUID (references auth.users)
   - `stripe_subscription_id` - Stripe subscription ID
   - `status` - Subscription status
   - `plan_name`, `plan_id` - Plan information
   - `stripe_customer_id` - Stripe customer ID
   - `current_period_start/end` - Billing period
   - `cancel_at_period_end` - Cancellation flag

3. **`invoices`** - Billing invoices
   - `id` - UUID primary key
   - `user_id` - UUID (references auth.users)
   - `stripe_invoice_id` - Stripe invoice ID
   - `amount` - Amount in cents
   - `currency` - Currency code
   - `status` - Invoice status
   - `description` - Invoice description
   - `hosted_invoice_url` - Stripe hosted URL

4. **`usage_counters`** - Token usage tracking
   - `id` - UUID primary key
   - `user_id` - UUID (references auth.users)
   - `date` - Usage date
   - `daily_tokens_used` - Tokens used today
   - `monthly_tokens_used` - Tokens used this month

### Functions Created

1. **`get_user_usage(user_id UUID)`** - Returns usage summary
   - `daily_used` - Tokens used today
   - `daily_limit` - Daily token limit
   - `monthly_used` - Tokens used this month
   - `monthly_limit` - Monthly token limit

### Security Features

- **Row Level Security (RLS)** enabled on all tables
- **RLS Policies** ensure users can only access their own data
- **Automatic Profile Creation** via database trigger
- **Secure Function Execution** with proper permissions

## 🧪 Testing the Setup

### 1. Test Profile Creation

After a user signs up, their profile should be automatically created:

```sql
SELECT * FROM profiles WHERE id = 'user-uuid-here';
```

### 2. Test Usage Function

```sql
SELECT * FROM get_user_usage('user-uuid-here');
```

### 3. Test RLS Policies

Make sure users can only see their own data:

```sql
-- This should only return the current user's data
SELECT * FROM profiles;
SELECT * FROM subscriptions;
SELECT * FROM invoices;
```

## 🔧 Manual Data Population (Optional)

If you want to populate test data, you can run:

```sql
-- Insert test subscription
INSERT INTO subscriptions (
  user_id,
  status,
  plan_name,
  plan_id,
  current_period_start,
  current_period_end
) VALUES (
  'user-uuid-here',
  'active',
  'Pro Plan',
  'pro_monthly',
  NOW(),
  NOW() + INTERVAL '1 month'
);

-- Insert test invoice
INSERT INTO invoices (
  user_id,
  amount,
  currency,
  status,
  description
) VALUES (
  'user-uuid-here',
  2500,
  'usd',
  'paid',
  'Pro Plan - Monthly'
);

-- Insert test usage
INSERT INTO usage_counters (
  user_id,
  date,
  daily_tokens_used,
  monthly_tokens_used
) VALUES (
  'user-uuid-here',
  CURRENT_DATE,
  125000,
  8500000
);
```

## 🚨 Troubleshooting

### Common Issues

1. **Tables don't exist**
   - Make sure the migration ran successfully
   - Check for SQL syntax errors

2. **RLS blocking queries**
   - Ensure you're authenticated as the correct user
   - Check RLS policies are correct

3. **Function not found**
   - Verify the function was created
   - Check function permissions

4. **Profile not created automatically**
   - Check the trigger is installed
   - Verify trigger function exists

### Debug Queries

```sql
-- Check all tables
SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public';

-- Check all functions
SELECT proname FROM pg_proc WHERE proname = 'get_user_usage';

-- Check RLS policies
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Check triggers
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

## 📝 Notes

- The schema is designed to work with Supabase Auth
- All tables have proper indexes for performance
- RLS ensures data security and privacy
- The `get_user_usage` function automatically determines limits based on subscription status

After running the migration, your settings page should work without 404 errors!
