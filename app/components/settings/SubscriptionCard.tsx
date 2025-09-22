import React, { useState, useMemo } from 'react';
import { billingActions } from '~/lib/settings/billing';
import { type Subscription, type UsageSummary, type Invoice } from '~/lib/settings/data';

const CARD_CLASS = 'rounded-lg border border-conformity-elements-borderColor bg-conformity-elements-background-depth-3/65 p-5 shadow-sm';

interface SubscriptionCardProps {
  subscription: Subscription | null;
  usage: UsageSummary | null;
  invoices: Invoice[];
  isLoading: boolean;
  onDataUpdate: () => void;
}

export function SubscriptionCard({ subscription, usage, invoices, isLoading, onDataUpdate }: SubscriptionCardProps) {
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isManagingBilling, setIsManagingBilling] = useState(false);

  const formatNumber = (num: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);

  const monthlyUsagePercent = useMemo(() => {
    if (!usage) return 0;
    return Math.min((usage.monthly_used / usage.monthly_limit) * 100, 100);
  }, [usage]);

  const dailyUsagePercent = useMemo(() => {
    if (!usage) return 0;
    return Math.min((usage.daily_used / usage.daily_limit) * 100, 100);
  }, [usage]);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'active':
        return { color: 'text-green-500', bgColor: 'bg-green-500', text: 'Active' };
      case 'canceled':
        return { color: 'text-yellow-500', bgColor: 'bg-yellow-500', text: 'Canceled' };
      case 'past_due':
        return { color: 'text-red-500', bgColor: 'bg-red-500', text: 'Past Due' };
      case 'incomplete':
        return { color: 'text-yellow-500', bgColor: 'bg-yellow-500', text: 'Incomplete' };
      case 'unpaid':
        return { color: 'text-red-500', bgColor: 'bg-red-500', text: 'Unpaid' };
      default:
        return { color: 'text-gray-500', bgColor: 'bg-gray-500', text: 'Unknown' };
    }
  };

  const handleUpgrade = async (priceId: string) => {
    setIsUpgrading(true);
    try {
      const result = await billingActions.startCheckout({
        priceId,
        successUrl: `${window.location.origin}/settings?tab=subscription`,
        cancelUrl: `${window.location.origin}/settings?tab=subscription`,
      });

      if (!result.ok && result.error) {
        alert(`Failed to start checkout: ${result.error}`);
      }
    } catch (error) {
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setIsUpgrading(false);
      onDataUpdate();
    }
  };

  const handleManageBilling = async () => {
    setIsManagingBilling(true);
    try {
      const result = await billingActions.openBillingPortal();

      if (!result.ok && result.error) {
        alert(`Failed to open billing portal: ${result.error}`);
      }
    } catch (error) {
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setIsManagingBilling(false);
      onDataUpdate();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-conformity-elements-background-depth-3 rounded animate-pulse" />
        <div className="space-y-4">
          <div className="h-32 bg-conformity-elements-background-depth-3 rounded animate-pulse" />
          <div className="h-48 bg-conformity-elements-background-depth-3 rounded animate-pulse" />
          <div className="h-24 bg-conformity-elements-background-depth-3 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const statusInfo = subscription ? getStatusInfo(subscription.status) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.28em] text-conformity-elements-textTertiary">Plan & usage</p>
        <h2 className="text-xl font-semibold text-conformity-elements-textPrimary">Subscription & tokens</h2>
        <p className="text-sm text-conformity-elements-textTertiary max-w-[70ch]">
          Track monthly consumption, manage billing, and upgrade whenever you need more capacity.
        </p>
      </div>

      <div className={CARD_CLASS}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-conformity-elements-textPrimary">{subscription?.plan_name || 'Free Plan'}</p>
            {subscription?.current_period_end && (
              <p className="text-sm text-conformity-elements-textTertiary">
                {subscription.cancel_at_period_end ? 'Ends' : 'Renews'} on{' '}
                {new Date(subscription.current_period_end).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {subscription && (
              <span className={`flex items-center gap-2 rounded-full border border-conformity-elements-borderColor px-3 py-1 text-xs font-medium ${statusInfo?.color}`}>
                <span className={`h-2 w-2 rounded-full ${statusInfo?.bgColor}`} aria-hidden />
                {statusInfo?.text}
              </span>
            )}
            {subscription?.status === 'active' ? (
              <button
                onClick={handleManageBilling}
                disabled={isManagingBilling}
                className="rounded-lg border border-conformity-elements-borderColor bg-conformity-elements-background-depth-2 px-4 py-2 text-sm font-medium text-conformity-elements-textPrimary transition hover:bg-conformity-elements-background-depth-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isManagingBilling ? 'Loading…' : 'Manage billing'}
              </button>
            ) : (
              <button
                onClick={() => handleUpgrade('price_pro_monthly')}
                disabled={isUpgrading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isUpgrading ? 'Loading…' : 'Upgrade to Pro'}
              </button>
            )}
          </div>
        </div>

        {usage && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-conformity-elements-textPrimary font-medium">Token balance</span>
              <span className="rounded-full border border-conformity-elements-borderColor px-3 py-1 text-xs text-conformity-elements-textTertiary">
                {formatNumber(usage.monthly_limit - usage.monthly_used)} remaining
              </span>
            </div>

            <UsageBar
              label={`${formatNumber(usage.monthly_used)} / ${formatNumber(usage.monthly_limit)} monthly tokens`}
              hint={`Resets ${new Date(usage.next_refill_date).toLocaleDateString()}`}
              percentage={monthlyUsagePercent}
              color="bg-blue-500"
            />

            {usage.daily_limit < usage.monthly_limit && (
              <UsageBar
                label={`${formatNumber(usage.daily_used)} / ${formatNumber(usage.daily_limit)} daily tokens`}
                hint="Resets daily"
                percentage={dailyUsagePercent}
                color="bg-green-500"
              />
            )}
          </div>
        )}
      </div>

      {(!subscription || subscription.status !== 'active') && (
        <div className={CARD_CLASS}>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-conformity-elements-textPrimary">Upgrade to Pro</p>
              <p className="mt-1 text-3xl font-bold text-blue-600">$25<span className="text-base font-medium text-conformity-elements-textSecondary">/mo</span></p>
              <p className="text-sm text-conformity-elements-textTertiary">per month, billed monthly</p>
              <p className="mt-3 text-xs uppercase tracking-[0.3em] text-conformity-elements-textTertiary">
                Current plan: {subscription?.plan_name || 'Free'}
              </p>
            </div>
            <ul className="space-y-2 text-sm text-conformity-elements-textPrimary">
              {[
                '10M tokens each month',
                'No daily throttling',
                'Priority support',
                'Advanced workflows',
                'API access',
                'Custom integrations'
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-6 flex flex-col gap-3 border-t border-conformity-elements-borderColor pt-6 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-conformity-elements-textTertiary">Upgrade instantly—no downtime and you can cancel anytime.</p>
            <button
              onClick={() => handleUpgrade('price_pro_monthly')}
              disabled={isUpgrading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isUpgrading ? 'Starting checkout…' : 'Upgrade to Pro'}
            </button>
          </div>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-conformity-elements-textPrimary">Recent invoices</p>
          <div className="space-y-2">
            {invoices.slice(0, 3).map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between rounded-lg border border-conformity-elements-borderColor bg-conformity-elements-background-depth-3/60 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${
                    invoice.status === 'paid' ? 'bg-green-500' :
                    invoice.status === 'open' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-conformity-elements-textPrimary">
                      {invoice.description || `Invoice ${invoice.id.slice(-8)}`}
                    </p>
                    <p className="text-xs text-conformity-elements-textTertiary">{new Date(invoice.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-conformity-elements-textPrimary">${(invoice.amount / 100).toFixed(2)}</p>
                  <p className={`text-xs capitalize ${
                    invoice.status === 'paid' ? 'text-green-500' :
                    invoice.status === 'open' ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {invoice.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface UsageBarProps {
  label: string;
  hint: string;
  percentage: number;
  color: string;
}

function UsageBar({ label, hint, percentage, color }: UsageBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-conformity-elements-textPrimary">{label}</span>
        <span className="text-conformity-elements-textTertiary">{hint}</span>
      </div>
      <div className="h-2 bg-conformity-elements-background-depth-4 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
