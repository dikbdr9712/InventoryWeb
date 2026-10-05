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

export interface Bank {
  code: string;       // the gateway's bank id, for example 1010
  shortName: string;  // BoB
  name: string;       // Bank of Bhutan
}

// For staff: a bank payment whose result the bank never sent
export interface BankPaymentToCheck {
  reference: string;
  orderId: number;
  amount: number;
  customerEmail?: string;
  bankName?: string;
  accountLast4?: string;
  gatewayTransactionId?: string;
  askedAt?: string;
}

// Paying from a bank account: where it stands. The server keeps only the last 4 digits of the account.
export interface BankPaymentView {
  reference: string;
  orderId: number;
  amount: number;
  status: 'STARTED' | 'CODE_SENT' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'CHECK_BANK';
  bankCode?: string;
  bankName?: string;
  accountLast4?: string;
  codeExpiresAt?: string;
  wrongCodesLeft: number;
  codesLeft: number;
  testMode: boolean;
  testCode?: string;   // only in test mode
  bankReference?: string; // the bank's journal number once paid
  message?: string;
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

  // Paying from a bank account (page /pay/bank)
  banks() {
    return this.http.get<Bank[]>(`${this.api}/bank/banks`);
  }

  bankView(reference: string) {
    return this.http.get<BankPaymentView>(`${this.api}/bank/${encodeURIComponent(reference)}`);
  }

  // the bank sends a one-time code to the phone registered with this account
  bankRequestCode(reference: string, bankCode: string, accountNumber: string) {
    return this.http.post<BankPaymentView>(`${this.api}/bank/${encodeURIComponent(reference)}/code`, { bankCode, accountNumber });
  }

  // the code approves the payment
  bankPay(reference: string, code: string) {
    return this.http.post<BankPaymentView>(`${this.api}/bank/${encodeURIComponent(reference)}/pay`, { code });
  }

  // Staff: payments the bank never answered, and settling them after asking the bank
  bankToCheck() {
    return this.http.get<BankPaymentToCheck[]>(`${this.api}/bank/to-check`);
  }

  bankSettle(reference: string, paid: boolean, bankJournal: string | null) {
    return this.http.post<BankPaymentView>(`${this.api}/bank/${encodeURIComponent(reference)}/settle`, { paid, bankJournal });
  }

  // Go to the gateway: inside our site (the test page) by the router, anywhere else by a full page load
  goTo(redirectUrl: string, navigate: (path: string) => void) {
    const here = window.location.origin;
    if (redirectUrl.startsWith(here)) navigate(redirectUrl.substring(here.length));
    else if (redirectUrl.startsWith('/')) navigate(redirectUrl);
    else window.location.href = redirectUrl;
  }
}
