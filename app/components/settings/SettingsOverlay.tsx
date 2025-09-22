import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from '@remix-run/react';

import {
  settingsModalStore,
  openSettingsModal,
  closeSettingsModal,
} from '~/lib/stores/settings-modal';
import {
  getSettingsDataLayer,
  type Invoice,
  type Subscription,
  type UsageSummary,
  type UserProfile,
} from '~/lib/settings/data';
import { SettingsLayout, ProfileHeader, GeneralCard, SubscriptionCard, KnowledgeCard } from '.';

export function SettingsOverlay() {
  const { open, tab } = useStore(settingsModalStore);
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<string>('general');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestedTab = searchParams.get('settings');
    if (requestedTab) {
      openSettingsModal(requestedTab);
      const next = new URLSearchParams(searchParams);
      next.delete('settings');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (tab) setActiveTab(tab);
  }, [tab]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const dataLayer = getSettingsDataLayer();
      const [profileResult, subscriptionResult, usageResult, invoicesResult] = await Promise.allSettled([
        dataLayer.getProfile(),
        dataLayer.getSubscription(),
        dataLayer.getUsageSummary(),
        dataLayer.getRecentInvoices(3),
      ]);

      const collectedErrors: string[] = [];

      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value.data);
        if (profileResult.value.error) collectedErrors.push(profileResult.value.error);
      } else if (profileResult.reason) {
        collectedErrors.push(String(profileResult.reason));
      }

      if (subscriptionResult.status === 'fulfilled') {
        setSubscription(subscriptionResult.value.data);
        if (subscriptionResult.value.error) collectedErrors.push(subscriptionResult.value.error);
      } else if (subscriptionResult.reason) {
        collectedErrors.push(String(subscriptionResult.reason));
      }

      if (usageResult.status === 'fulfilled') {
        setUsage(usageResult.value.data);
        if (usageResult.value.error) collectedErrors.push(usageResult.value.error);
      } else if (usageResult.reason) {
        collectedErrors.push(String(usageResult.reason));
      }

      if (invoicesResult.status === 'fulfilled') {
        setInvoices(invoicesResult.value.data);
        if (invoicesResult.value.error) collectedErrors.push(invoicesResult.value.error);
      } else if (invoicesResult.reason) {
        collectedErrors.push(String(invoicesResult.reason));
      }

      if (collectedErrors.length > 0) {
        console.error('Settings data loading errors:', collectedErrors);
        setError(collectedErrors.join('\n'));
      }
    } catch (err) {
      console.error('Failed to load settings data:', err);
      setError('Failed to load settings data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadData();

    const dataLayer = getSettingsDataLayer();

    const handleProfileUpdate = (payload: any) => {
      if (payload.eventType === 'UPDATE') {
        setProfile((current) => (current ? { ...current, ...payload.new } : current));
      }
    };

    const handleSubscriptionUpdate = () => {
      loadData();
    };

    const handleUsageUpdate = () => {
      dataLayer.getUsageSummary().then((result) => {
        if (result.data) setUsage(result.data);
      });
    };

    dataLayer.on('profile-update', handleProfileUpdate);
    dataLayer.on('subscription-update', handleSubscriptionUpdate);
    dataLayer.on('usage-update', handleUsageUpdate);

    const polling = setInterval(() => {
      dataLayer.getSubscription().then((result) => {
        setSubscription((current) => {
          if (result.data && JSON.stringify(result.data) !== JSON.stringify(current)) {
            return result.data;
          }
          return current;
        });
      });
    }, 60000);

    return () => {
      dataLayer.off('profile-update', handleProfileUpdate);
      dataLayer.off('subscription-update', handleSubscriptionUpdate);
      dataLayer.off('usage-update', handleUsageUpdate);
      clearInterval(polling);
    };
  }, [open, loadData]);

  const handleProfileUpdate = useCallback((updates: Partial<UserProfile>) => {
    setProfile((current) => {
      if (!current) {
        if (updates && 'id' in updates && typeof updates.id === 'string') {
          return { ...(updates as UserProfile) };
        }
        return current;
      }
      return { ...current, ...updates } as UserProfile;
    });
  }, []);

  const handleDataUpdate = useCallback(() => {
    loadData();
  }, [loadData]);

  const content = useMemo(() => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-6">
            <ProfileHeader profile={profile} isLoading={isLoading} onProfileUpdate={handleProfileUpdate} />
            <GeneralCard isLoading={isLoading} />
          </div>
        );
      case 'subscription':
        return (
          <div className="space-y-6">
            <ProfileHeader profile={profile} isLoading={isLoading} onProfileUpdate={handleProfileUpdate} />
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
          <div className="space-y-6">
            <KnowledgeCard />
          </div>
        );
      default:
        return (
          <div className="py-12 text-center text-conformity-elements-textTertiary">
            This section is not yet available.
          </div>
        );
    }
  }, [activeTab, isLoading, profile, subscription, usage, invoices, handleProfileUpdate, handleDataUpdate]);

  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('settings');
      window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
    }
    closeSettingsModal();
  }, []);

  if (!open) return null;

  return createPortal(
    <SettingsLayout activeTab={activeTab} onTabChange={setActiveTab} onClose={handleClose}>
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-200">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="i-ph:warning text-lg" />
            <span>Error loading data</span>
          </div>
          <p className="mt-2 text-sm text-red-100/80">{error}</p>
          <button
            onClick={loadData}
            className="mt-3 rounded bg-red-600 px-3 py-1 text-sm font-medium text-white transition hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}
      {content}
    </SettingsLayout>,
    document.body,
  );
}
