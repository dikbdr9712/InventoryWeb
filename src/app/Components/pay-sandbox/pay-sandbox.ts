import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { OnlinePaymentsService, PaymentAttempt } from '../../services/online-payments';
import { errorText } from '../../utils/http-error';

// The TEST payment gateway: stands in for a bank's payment page, so the whole online flow can be tried
// without real money. It only works while the server's test gateway is switched on (never on the live site).
@Component({
  selector: 'app-pay-sandbox',
  imports: [DecimalPipe],
  template: `
    <div class="page sandbox-page">
      <section class="panel sandbox">
        <p class="badge-test"><i class="fas fa-flask"></i> Test payment page: no real money moves</p>
        @if (attempt(); as a) {
          <h1>Pay Nu. {{ a.amount | number: '1.2-2' }}</h1>
          <p class="muted">DP DrukBazaars order #{{ a.orderId }} · payment {{ a.reference }}</p>

          @if (a.status === 'CREATED') {
            <p>On the live site, this is where the bank's page asks for your account and one-time code.
               Here you choose what the "bank" answers:</p>
            <div class="choices">
              <button type="button" class="btn btn-primary btn-lg" [disabled]="busy()" (click)="answer('PAID')">
                <i class="fas fa-check"></i> Pay Nu. {{ a.amount | number: '1.2-2' }}
              </button>
              <button type="button" class="btn btn-outline-danger" [disabled]="busy()" (click)="answer('FAILED')">
                <i class="fas fa-xmark"></i> The payment fails
              </button>
              <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="answer('CANCELLED')">
                Cancel and go back
              </button>
            </div>
          } @else {
            <p>This payment is already finished ({{ a.status.toLowerCase() }}).</p>
            <button type="button" class="btn btn-primary" (click)="toResult()">See the result</button>
          }
        } @else if (error()) {
          <div class="alert alert-danger">{{ error() }}</div>
        } @else {
          <p class="muted">Loading the payment...</p>
        }
      </section>
    </div>
  `,
  styles: [`
    .sandbox-page { max-width: 560px; }
    .sandbox { padding: 24px; }
    .sandbox h1 { margin: 8px 0 4px; font-size: 1.6rem; }
    .badge-test {
      display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 4px 10px; border-radius: 999px;
      background: var(--saffron-soft); color: #7a5200; font-size: 0.85rem; font-weight: 700;
    }
    .muted { color: var(--muted); }
    .choices { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
  `]
})
export class PaySandbox implements OnInit {
  private payments = inject(OnlinePaymentsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private reference = this.route.snapshot.queryParamMap.get('ref') ?? '';
  attempt = signal<PaymentAttempt | null>(null);
  error = signal('');
  busy = signal(false);

  ngOnInit() {
    this.payments.status(this.reference).subscribe({
      next: a => this.attempt.set(a),
      error: (err: HttpErrorResponse) => this.error.set(errorText(err))
    });
  }

  answer(outcome: 'PAID' | 'FAILED' | 'CANCELLED') {
    this.busy.set(true);
    this.payments.sandbox(this.reference, outcome).subscribe({
      next: () => this.toResult(),
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(errorText(err));
      }
    });
  }

  toResult() {
    this.router.navigate(['/payment/result'], { queryParams: { ref: this.reference }, replaceUrl: true });
  }
}
