-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'unpaid')),
  plan_name TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  stripe_customer_id TEXT,
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE,
  amount INTEGER NOT NULL, -- Amount in cents
  currency TEXT DEFAULT 'usd',
  status TEXT CHECK (status IN ('paid', 'open', 'void', 'draft')),
  description TEXT,
  hosted_invoice_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create usage_counters table for tracking token usage
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  daily_tokens_used INTEGER DEFAULT 0,
  monthly_tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create RLS policies for subscriptions
CREATE POLICY "Users can view their own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions" ON public.subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions" ON public.subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for invoices
CREATE POLICY "Users can view their own invoices" ON public.invoices
  FOR SELECT USING (auth.uid() = user_id);

-- Create RLS policies for usage_counters
CREATE POLICY "Users can view their own usage" ON public.usage_counters
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage" ON public.usage_counters
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage" ON public.usage_counters
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create function to get user usage summary
CREATE OR REPLACE FUNCTION get_user_usage(user_id UUID)
RETURNS TABLE (
  daily_used BIGINT,
  daily_limit BIGINT,
  monthly_used BIGINT,
  monthly_limit BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_subscription RECORD;
  daily_limit_val BIGINT := 50000;  -- Free tier default
  monthly_limit_val BIGINT := 1000000;  -- Free tier default
BEGIN
  -- Get user's subscription to determine limits
  SELECT * INTO user_subscription
  FROM subscriptions
  WHERE subscriptions.user_id = get_user_usage.user_id
    AND status = 'active'
    AND current_period_end > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Set limits based on subscription
  IF user_subscription.plan_id = 'pro_monthly' OR user_subscription.plan_id = 'pro_yearly' THEN
    daily_limit_val := 1000000;  -- No daily limit for pro
    monthly_limit_val := 10000000;
  END IF;

  -- Return usage summary
  RETURN QUERY
  SELECT
    COALESCE(SUM(uc.daily_tokens_used), 0)::BIGINT as daily_used,
    daily_limit_val as daily_limit,
    COALESCE(SUM(uc.monthly_tokens_used), 0)::BIGINT as monthly_used,
    monthly_limit_val as monthly_limit
  FROM usage_counters uc
  WHERE uc.user_id = get_user_usage.user_id
    AND (
      -- Daily usage (today)
      uc.date = CURRENT_DATE
      OR
      -- Monthly usage (current month)
      DATE_TRUNC('month', uc.date) = DATE_TRUNC('month', CURRENT_DATE)
    );
END;
$$;

-- Create function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_id ON public.invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_usage_counters_user_id ON public.usage_counters(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_counters_date ON public.usage_counters(date);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.subscriptions TO authenticated;
GRANT ALL ON public.invoices TO authenticated;
GRANT ALL ON public.usage_counters TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_usage(UUID) TO authenticated;
