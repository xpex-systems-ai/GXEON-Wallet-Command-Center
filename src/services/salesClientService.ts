import { CheckoutSessionInput, CheckoutSessionResult } from '../server/stripeServerService';

export class SalesClientService {
  private apiBaseUrl: string;

  constructor(apiBaseUrl = '/api') {
    this.apiBaseUrl = apiBaseUrl;
  }

  async requestCheckout(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    const response = await fetch(`${this.apiBaseUrl}/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Checkout request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!data.checkoutUrl) {
      throw new Error('Server did not return a valid checkoutUrl');
    }

    return data;
  }
}

export const salesClientService = new SalesClientService();
