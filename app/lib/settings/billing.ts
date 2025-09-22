// Framework-agnostic billing actions
// Client-side functions that call server endpoints for Stripe operations

export interface BillingResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export interface CheckoutOptions {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
}

export class BillingActions {
  private baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async startCheckout(options: CheckoutOptions): Promise<BillingResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: options.priceId,
          successUrl: options.successUrl || `${window.location.origin}/settings?tab=subscription`,
          cancelUrl: options.cancelUrl || `${window.location.origin}/settings?tab=subscription`,
        }),
      });

      const result = await response.json() as { error?: string; url?: string };

      if (!response.ok) {
        return {
          ok: false,
          error: result.error || 'Failed to create checkout session',
        };
      }

      if (result.url) {
        // Redirect to Stripe Checkout
        window.location.href = result.url;
        return { ok: true };
      }

      return {
        ok: false,
        error: 'No checkout URL received',
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  async openBillingPortal(): Promise<BillingResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/billing/portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json() as { error?: string; url?: string };

      if (!response.ok) {
        return {
          ok: false,
          error: result.error || 'Failed to create billing portal session',
        };
      }

      if (result.url) {
        // Redirect to Stripe Customer Portal
        window.location.href = result.url;
        return { ok: true };
      }

      return {
        ok: false,
        error: 'No portal URL received',
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // Utility method to check if user has active subscription
  async hasActiveSubscription(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/billing/subscription-status`);
      const result = await response.json() as { active?: boolean };

      return result.active === true;
    } catch (error) {
      console.error('Failed to check subscription status:', error);
      return false;
    }
  }
}

// Singleton instance
export const billingActions = new BillingActions();
