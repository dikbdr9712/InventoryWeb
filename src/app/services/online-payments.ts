import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface PaymentOption {
  code: string;   // for example SANDBOX
  label: string;  // what the customer sees
}

export interface PaymentAttempt {
  reference: string;
  orderId: number;
  amount: number;
  currency: string;
  provider: string;
  status: 'CREATED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  message?: string;
  providerReference?: string;
  createdAt: string;
  completedAt?: string;
}

// Paying an order online. The amount is always the order's total on the server.
@Injectable({ providedIn: 'root' })
export class OnlinePaymentsService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/online-payments`;

  options() {
    return this.http.get<PaymentOption[]>(`${this.api}/options`);
  }

  start(orderId: number, provider: string) {
    return this.http.post<{ reference: string; redirectUrl: string }>(`${this.api}/start`, { orderId, provider });
  }

  status(reference: string) {
    return this.http.get<PaymentAttempt>(`${this.api}/${encodeURIComponent(reference)}`);
  }

  cancel(reference: string) {
    return this.http.post<PaymentAttempt>(`${this.api}/${encodeURIComponent(reference)}/cancel`, null);
  }

  // the test gateway's buttons
  sandbox(reference: string, outcome: 'PAID' | 'FAILED' | 'CANCELLED') {
    return this.http.post<PaymentAttempt>(`${this.api}/sandbox/${encodeURIComponent(reference)}`, { outcome });
  }

  // Go to the gateway: inside our site (the test page) by the router, anywhere else by a full page load
  goTo(redirectUrl: string, navigate: (path: string) => void) {
    const here = window.location.origin;
    if (redirectUrl.startsWith(here)) navigate(redirectUrl.substring(here.length));
    else if (redirectUrl.startsWith('/')) navigate(redirectUrl);
    else window.location.href = redirectUrl;
  }
}
