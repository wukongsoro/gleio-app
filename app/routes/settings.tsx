import { useStore } from '@nanostores/react';
import { Link, useSearchParams } from '@remix-run/react';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { clearAllChats, openDatabase } from '~/lib/persistence/db';
import { settingsStore, setSetting } from '~/lib/stores/settings';
import { themeStore, type Theme } from '~/lib/stores/theme';
import { getSettingsDataLayer, type UserProfile, type Subscription, type UsageSummary, type Invoice } from '~/lib/settings/data';
import { SettingsLayout, ProfileHeader, GeneralCard, SubscriptionCard, KnowledgeCard } from '~/components/settings';
import { Header } from '~/components/header/Header';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<string>('general');

  // Data state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Set active tab from URL params
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['general', 'subscription', 'applications', 'cloud', 'knowledge', 'experimental'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Load all data on mount
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const dataLayer = getSettingsDataLayer();

      // Load data in parallel for better performance
      const [profileResult, subscriptionResult, usageResult, invoicesResult] = await Promise.allSettled([
        dataLayer.getProfile(),
        dataLayer.getSubscription(),
        dataLayer.getUsageSummary(),
        dataLayer.getRecentInvoices(3),
      ]);

      // Handle results
      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value.data);
      }

      if (subscriptionResult.status === 'fulfilled') {
        setSubscription(subscriptionResult.value.data);
      }

      if (usageResult.status === 'fulfilled') {
        setUsage(usageResult.value.data);
      }

      if (invoicesResult.status === 'fulfilled') {
        setInvoices(invoicesResult.value.data);
      }

      // Check for errors
      const errors = [
        profileResult.status === 'rejected' ? profileResult.reason : null,
        subscriptionResult.status === 'rejected' ? subscriptionResult.reason : null,
        usageResult.status === 'rejected' ? usageResult.reason : null,
        invoicesResult.status === 'rejected' ? invoicesResult.reason : null,
      ].filter(Boolean);

      if (errors.length > 0) {
        setError('Some data failed to load. Please refresh the page.');
        console.error('Data loading errors:', errors);
      }

    } catch (error) {
      console.error('Failed to load settings data:', error);
      setError('Failed to load settings data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Set up real-time subscriptions
  useEffect(() => {
    loadData();

    const dataLayer = getSettingsDataLayer();

    // Subscribe to real-time updates
    const handleProfileUpdate = (payload: any) => {
      console.log('Profile updated:', payload);
      if (payload.eventType === 'UPDATE') {
        setProfile(current => current ? { ...current, ...payload.new } : null);
      }
    };

    const handleSubscriptionUpdate = (payload: any) => {
      console.log('Subscription updated:', payload);
      loadData(); // Reload all data when subscription changes
    };

    const handleUsageUpdate = (payload: any) => {
      console.log('Usage updated:', payload);
      // Reload usage data
      dataLayer.getUsageSummary().then(result => {
        if (result.data) {
          setUsage(result.data);
        }
      });
    };

    dataLayer.on('profile-update', handleProfileUpdate);
    dataLayer.on('subscription-update', handleSubscriptionUpdate);
    dataLayer.on('usage-update', handleUsageUpdate);

    // Polling fallback for billing data (every 60 seconds)
    const billingInterval = setInterval(() => {
      dataLayer.getSubscription().then(result => {
        if (result.data && JSON.stringify(result.data) !== JSON.stringify(subscription)) {
          setSubscription(result.data);
        }
      });
    }, 60000);

    return () => {
      dataLayer.off('profile-update', handleProfileUpdate);
      dataLayer.off('subscription-update', handleSubscriptionUpdate);
      dataLayer.off('usage-update', handleUsageUpdate);
      clearInterval(billingInterval);
    };
  }, [loadData, subscription]);

  const handleProfileUpdate = useCallback((updates: Partial<UserProfile>) => {
    setProfile((current) => {
      if (!current) {
        return updates && 'id' in updates && typeof updates.id === 'string'
          ? ({ ...(updates as UserProfile) })
          : current;
      }

      return { ...current, ...updates } as UserProfile;
    });
  }, []);

  const handleDataUpdate = useCallback(() => {
    loadData();
  }, [loadData]);

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
  return (
          <div className="space-y-8">
            <ProfileHeader
              profile={profile}
              isLoading={isLoading}
              onProfileUpdate={handleProfileUpdate}
            />
            <GeneralCard isLoading={isLoading} />
          </div>
        );

      case 'subscription':
        return (
          <div className="space-y-8">
            <ProfileHeader
              profile={profile}
              isLoading={isLoading}
              onProfileUpdate={handleProfileUpdate}
            />
            <SubscriptionCard
              subscription={subscription}
              usage={usage}
              invoices={invoices}
              isLoading={isLoading}
              onDataUpdate={handleDataUpdate}
            />
          </div>
        );

      case 'knowledge':
        return (
          <div className="space-y-8">
            <KnowledgeCard />
          </div>
        );

      default:
        return (
          <div className="text-center py-12">
            <div className="text-conformity-elements-textTertiary">
              This section is not yet available.
            </div>
          </div>
        );
}
  };

  return (
    <div className="flex flex-col h-full w-full home-theme bg-app-gradient">
      <ErrorBoundary>
        <Header isHome={false} />
      </ErrorBoundary>
      <ErrorBoundary>
        <ClientOnly fallback={<BaseChat isHome={false} />}>
          {() => <Chat isHome={false} />}
        </ClientOnly>
      </ErrorBoundary>
      
      <SettingsLayout activeTab={activeTab} onTabChange={setActiveTab}>
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-red-400">
              <span className="i-ph:warning text-lg" />
              <span className="text-sm font-medium">Error loading data</span>
            </div>
            <div className="mt-2 text-sm text-red-300">{error}</div>
            <button
              onClick={loadData}
              className="mt-3 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        {renderContent()}
      </SettingsLayout>
    </div>
  );
}