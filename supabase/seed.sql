-- Seed data for development and testing
-- Run this after the migration to populate test data

-- Insert test profile (replace with actual user ID)
-- Note: This will only work if you have a real user ID from Supabase Auth

-- Example seed data (uncomment and modify with real user IDs):
/*
-- Insert test subscription for a user
INSERT INTO subscriptions (
  user_id,
  status,
  plan_name,
  plan_id,
  current_period_start,
  current_period_end,
  cancel_at_period_end
) VALUES (
  'your-user-id-here', -- Replace with actual user ID
  'active',
  'Pro Plan',
  'pro_monthly',
  NOW(),
  NOW() + INTERVAL '1 month',
  false
);

-- Insert test invoices
INSERT INTO invoices (
  user_id,
  amount,
  currency,
  status,
  description,
  hosted_invoice_url
) VALUES
(
  'your-user-id-here', -- Replace with actual user ID
  2500,
  'usd',
  'paid',
  'Pro Plan - Monthly',
  'https://invoice.stripe.com/test/inv_123'
),
(
  'your-user-id-here', -- Replace with actual user ID
  2500,
  'usd',
  'paid',
  'Pro Plan - Monthly',
  'https://invoice.stripe.com/test/inv_456'
);

-- Insert test usage data
INSERT INTO usage_counters (
  user_id,
  date,
  daily_tokens_used,
  monthly_tokens_used
) VALUES
(
  'your-user-id-here', -- Replace with actual user ID
  CURRENT_DATE,
  125000,
  8500000
),
(
  'your-user-id-here', -- Replace with actual user ID
  CURRENT_DATE - INTERVAL '1 day',
  95000,
  7500000
);
*/

-- You can also use this to test with mock data without real user IDs:
/*
-- Create a mock profile (for testing without auth)
INSERT INTO profiles (
  id,
  name,
  email,
  avatar_url
) VALUES (
  'mock-user-id',
  'Demo User',
  'demo@example.com',
  null
) ON CONFLICT (id) DO NOTHING;

-- Create mock subscription
INSERT INTO subscriptions (
  user_id,
  status,
  plan_name,
  plan_id,
  current_period_start,
  current_period_end
) VALUES (
  'mock-user-id',
  'active',
  'Pro Plan',
  'pro_monthly',
  NOW(),
  NOW() + INTERVAL '1 month'
) ON CONFLICT DO NOTHING;

-- Create mock invoices
INSERT INTO invoices (
  user_id,
  amount,
  currency,
  status,
  description
) VALUES
(
  'mock-user-id',
  2500,
  'usd',
  'paid',
  'Pro Plan - Monthly'
),
(
  'mock-user-id',
  2500,
  'usd',
  'paid',
  'Pro Plan - Monthly'
) ON CONFLICT DO NOTHING;

-- Create mock usage
INSERT INTO usage_counters (
  user_id,
  date,
  daily_tokens_used,
  monthly_tokens_used
) VALUES (
  'mock-user-id',
  CURRENT_DATE,
  125000,
  8500000
) ON CONFLICT DO NOTHING;
*/
