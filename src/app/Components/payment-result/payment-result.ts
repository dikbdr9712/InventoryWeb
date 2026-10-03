import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OnlinePaymentsService, PaymentAttempt } from '../../services/online-payments';
import { CartService } from '../../services/cart';
import { errorText } from '../../utils/http-error';

// Where the customer lands after the payment gateway. The gateway tells our server the result directly,
// so this page asks the server (a few times, for up to a minute) instead of trusting the address.
@Component({
  selector: 'app-payment-result',
  imports: [DecimalPipe, RouterLink],
  template: `
    <div class="page result-page">
      <section class="panel result" [class.ok]="attempt()?.status === 'PAID'"
               [class.bad]="attempt() && attempt()!.status !== 'PAID' && attempt()!.status !== 'CREATED'">
        @if (attempt(); as a) {
          @switch (a.status) {
            @case ('PAID') {
              <i class="fas fa-circle-check big"></i>
              <h1>Payment received</h1>
              <p>Nu. {{ a.amount | number: '1.2-2' }} for order #{{ a.orderId }}. Your order is confirmed and we are getting it ready.
                 We will tell you when it is on the way.</p>
              <p class="muted small">Payment reference {{ a.providerReference || a.reference }}</p>
              <div class="actions">
                <a class="btn btn-primary" [routerLink]="['/orders', a.orderId]">See my order</a>
                <a class="btn btn-secondary" routerLink="/products">Keep shopping</a>
              </div>
            }
            @case ('CREATED') {
              <span class="spinner-border" role="status"></span>
              <h1>Checking your payment...</h1>
              <p>This takes a few seconds. Please keep this page open.</p>
              @if (gaveUp()) {
                <p class="muted">The bank has not answered yet. If money left your account, it will show on your order soon;
                   you can also contact us with reference {{ a.reference }}.</p>
                <a class="btn btn-secondary" [routerLink]="['/orders', a.orderId]">Go to my order</a>
              }
            }
            @default {
              <i class="fas fa-circle-xmark big"></i>
              <h1>{{ a.status === 'CANCELLED' ? 'Payment cancelled' : 'The payment did not go through' }}</h1>
              <p>{{ a.message || 'No money was taken.' }} Your order #{{ a.orderId }} is saved: you can try again,
                 or pay by bank transfer.</p>
              <div class="actions">
                <a class="btn btn-primary" routerLink="/payment" [queryParams]="{ orderId: a.orderId }">Try again</a>
                <a class="btn btn-secondary" [routerLink]="['/orders', a.orderId]">See my order</a>
              </div>
            }
          }
        } @else if (error()) {
          <div class="alert alert-danger">{{ error() }}</div>
        } @else {
          <span class="spinner-border" role="status"></span>
          <p>Loading...</p>
        }
      </section>
    </div>
  `,
  styles: [`
    .result-page { max-width: 600px; }
    .result { padding: 28px 24px; text-align: center; }
    .result h1 { margin: 10px 0 8px; font-size: 1.5rem; }
    .result.ok { border-top: 4px solid var(--green); }
    .result.bad { border-top: 4px solid var(--red); }
    .big { font-size: 2.6rem; }
    .ok .big { color: var(--green); }
    .bad .big { color: var(--red); }
    .muted { color: var(--muted); }
    .small { font-size: 0.85rem; }
    .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 16px; }
  `]
})
export class PaymentResult implements OnInit, OnDestroy {
  private payments = inject(OnlinePaymentsService);
  private route = inject(ActivatedRoute);
  private cart = inject(CartService);

  private reference = this.route.snapshot.queryParamMap.get('ref') ?? '';
  private timer?: ReturnType<typeof setTimeout>;
  private tries = 0;
  attempt = signal<PaymentAttempt | null>(null);
  error = signal('');
  gaveUp = signal(false);

  ngOnInit() {
    this.check();
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
  }

  private check() {
    this.payments.status(this.reference).subscribe({
      next: a => {
        this.attempt.set(a);
        if (a.status === 'PAID') {
          this.cart.clear(); // the order is paid: the cart it came from is done
        } else if (a.status === 'CREATED') {
          if (++this.tries < 30) this.timer = setTimeout(() => this.check(), 2000);
          else this.gaveUp.set(true);
        }
      },
      error: (err: HttpErrorResponse) => this.error.set(errorText(err))
    });
  }
}
