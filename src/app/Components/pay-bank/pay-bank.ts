import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Bank, BankPaymentView, OnlinePaymentsService } from '../../services/online-payments';
import { errorText } from '../../utils/http-error';

// Seconds before "Send the code again" can be pressed (the text message needs a moment to arrive)
const RESEND_WAIT = 30;

// Paying from a bank account:
//   1. choose your bank and type the account number -> your bank texts a one-time code to the account's phone
//   2. type the code -> the money moves and the order is confirmed
// The account number stays in this page only (to send the code again); the server keeps the last 4 digits.
@Component({
  selector: 'app-pay-bank',
  imports: [DecimalPipe, RouterLink],
  template: `
    <div class="page bank-page">
      <section class="panel bank-pay">
        @if (view(); as v) {
          @if (v.testMode) {
            <div class="test-banner" role="note">
              <strong><i class="fas fa-flask"></i> Test mode: no bank is contacted and no money moves.</strong>
              <span>The code is <b>{{ v.testCode }}</b>. An account number ending in 0000 is "not found";
                one ending in 9999 has "not enough money".</span>
            </div>
          }

          <header class="head">
            <p class="muted small">DP DrukBazaars order #{{ v.orderId }}</p>
            <h1>Pay Nu. {{ v.amount | number: '1.2-2' }}</h1>
            <p class="gateway"><i class="fas fa-lock"></i> Secure payment through the RMA Payment Gateway
              (Royal Monetary Authority of Bhutan)</p>
            <ol class="steps" aria-label="Steps">
              <li [class.on]="step() === 1" [class.done]="step() === 2"><span>1</span> Bank and account</li>
              <li [class.on]="step() === 2"><span>2</span> Code from your phone</li>
            </ol>
          </header>

          @if (v.status === 'CHECK_BANK') {
            <!-- the bank was asked to take the money but its answer never came: staff check with the bank -->
            <div class="checking" role="status">
              <i class="fas fa-hourglass-half"></i>
              <div>
                <strong>We are checking this payment with your bank</strong>
                <p>{{ v.message }}</p>
                <p class="muted small">If money left your account, it is not lost: your order is confirmed as soon as the bank
                  confirms it. Payment {{ v.reference }}.</p>
              </div>
            </div>
            <a class="btn btn-primary btn-block" [routerLink]="['/orders', v.orderId]">Go to my order</a>
          } @else {
          @if (message()) {
            <div class="alert" [class.alert-danger]="messageBad()" [class.alert-info]="!messageBad()" role="alert">{{ message() }}</div>
          }

          @if (step() === 1) {
            <form (submit)="$event.preventDefault(); sendCode()" novalidate>
              <fieldset class="field">
                <legend>Your bank</legend>
                <div class="banks" role="radiogroup" aria-label="Your bank">
                  @for (b of banks(); track b.code) {
                    <button type="button" role="radio" class="bank" [class.on]="bankCode() === b.code"
                            [attr.aria-checked]="bankCode() === b.code" (click)="bankCode.set(b.code)">
                      <span class="bank-mark" aria-hidden="true">{{ b.shortName }}</span>
                      <span class="bank-name">{{ b.name }}</span>
                    </button>
                  } @empty {
                    <p class="muted">Loading the banks...</p>
                  }
                </div>
              </fieldset>

              <div class="field">
                <label for="account">Account number</label>
                <input id="account" class="form-control form-control-lg mono" type="text" inputmode="numeric"
                       autocomplete="off" maxlength="24" placeholder="As on your bank book or app"
                       [value]="account()" (input)="account.set(digitsAndSpaces($any($event.target).value))">
              </div>

              <p class="how muted small">
                <i class="fas fa-mobile-screen-button"></i>
                Your bank sends a one-time code by text message to the phone number registered with this account.
                We never ask for your bank password, and we keep only the last 4 digits of the account.
              </p>

              <button type="submit" class="btn btn-primary btn-lg btn-block" [disabled]="busy() || !canSend()">
                @if (busy()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="fas fa-paper-plane"></i> }
                Send the code to my phone
              </button>
              @if (v.status === 'CODE_SENT') {
                <button type="button" class="btn btn-link btn-block" (click)="editing.set(false)">Back to the code</button>
              }
            </form>
          } @else {
            <form (submit)="$event.preventDefault(); pay()" novalidate>
              <p class="sent">
                <i class="fas fa-comment-sms"></i>
                <span>{{ v.bankName }} sent a code to the phone registered with account
                  <b class="mono">•••• {{ v.accountLast4 }}</b>.</span>
              </p>

              <div class="field">
                <label for="code">Code from the text message</label>
                <input #codeInput id="code" class="form-control form-control-lg code" type="text" inputmode="numeric"
                       autocomplete="one-time-code" maxlength="8" placeholder="••••••"
                       [value]="code()" (input)="code.set(digitsOnly($any($event.target).value))">
                <div class="code-meta small">
                  @if (secondsLeft() > 0) {
                    <span class="muted">Valid for {{ clock(secondsLeft()) }}</span>
                  } @else {
                    <span class="bad">The code has expired. Ask for a new one.</span>
                  }
                  @if (v.wrongCodesLeft < 3) {
                    <span class="bad">{{ v.wrongCodesLeft }} {{ v.wrongCodesLeft === 1 ? 'try' : 'tries' }} left</span>
                  }
                </div>
              </div>

              <button type="submit" class="btn btn-primary btn-lg btn-block" [disabled]="busy() || code().length < 4 || secondsLeft() <= 0">
                @if (busy()) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="fas fa-lock"></i> }
                Pay Nu. {{ v.amount | number: '1.2-2' }}
              </button>

              <div class="again small">
                @if (v.codesLeft > 0) {
                  <button type="button" class="btn btn-link" [disabled]="busy() || resendIn() > 0" (click)="resend()">
                    Send the code again{{ resendIn() > 0 ? ' (' + clock(resendIn()) + ')' : '' }}
                  </button>
                } @else {
                  <span class="muted">No more codes can be sent for this payment.</span>
                }
                <button type="button" class="btn btn-link" [disabled]="busy()" (click)="changeAccount()">Use another account</button>
              </div>
            </form>
          }

          <div class="foot small">
            <button type="button" class="btn btn-link text-muted" [disabled]="busy()" (click)="cancel()">
              Cancel and choose another way to pay
            </button>
            <span class="muted">Payment {{ v.reference }}</span>
          </div>
          }
        } @else if (loadError()) {
          <div class="alert alert-danger">{{ loadError() }}</div>
          <a class="btn btn-secondary" routerLink="/orders">Go to my orders</a>
        } @else {
          <p class="muted"><span class="spinner-border spinner-border-sm"></span> Loading the payment...</p>
        }
      </section>
    </div>
  `,
  styles: [`
    .bank-page { max-width: 560px; }
    .bank-pay { padding: 24px; }
    .head h1 { margin: 2px 0 4px; font-size: 1.7rem; }
    .gateway { margin: 0 0 14px; color: var(--green-deep); font-size: 0.85rem; }
    .gateway i { margin-right: 4px; }
    .muted { color: var(--muted); }
    .small { font-size: 0.875rem; }
    .mono { font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
    .bad { color: var(--red); font-weight: 600; }

    .test-banner {
      display: flex; flex-direction: column; gap: 2px; margin-bottom: 16px; padding: 10px 12px;
      border-radius: 10px; background: var(--saffron-soft); color: #6b4800; font-size: 0.875rem;
    }

    .steps { display: flex; gap: 8px; margin: 0 0 18px; padding: 0; list-style: none; font-size: 0.875rem; color: var(--muted); }
    .steps li { display: flex; align-items: center; gap: 6px; }
    .steps li + li::before { content: ''; width: 18px; height: 1px; background: var(--line); margin-right: 2px; }
    .steps span {
      display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
      border: 1px solid var(--line); font-size: 0.75rem; font-weight: 700;
    }
    .steps li.on { color: var(--ink); font-weight: 600; }
    .steps li.on span { background: var(--green); border-color: var(--green); color: #fff; }
    .steps li.done span { background: var(--green-soft); border-color: var(--green-soft); color: var(--green-deep); }

    .field { margin: 0 0 16px; border: 0; padding: 0; min-width: 0; }
    .field legend, .field label { font-size: 0.95rem; font-weight: 600; margin-bottom: 6px; }

    .banks { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .bank {
      display: flex; align-items: center; gap: 10px; padding: 10px; min-height: 52px; text-align: left;
      border: 1px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink); cursor: pointer;
    }
    .bank:hover { border-color: var(--green); }
    .bank.on { border-color: var(--green); box-shadow: 0 0 0 2px var(--green) inset; background: var(--green-soft); }
    .bank-mark {
      flex: none; display: grid; place-items: center; min-width: 42px; height: 30px; padding: 0 4px; border-radius: 6px;
      background: var(--wash); font-size: 0.7rem; font-weight: 800; letter-spacing: 0.02em;
    }
    .bank.on .bank-mark { background: var(--green); color: #fff; }

    .checking {
      display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; padding: 14px;
      border-radius: 10px; background: var(--saffron-soft); color: #5c3d00;
    }
    .checking > i { margin-top: 4px; font-size: 1.2rem; }
    .checking p { margin: 4px 0 0; }
    .bank-name { font-size: 0.875rem; line-height: 1.25; }

    .how { display: flex; gap: 8px; align-items: flex-start; }
    .how i { margin-top: 3px; color: var(--green); }

    .sent { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: var(--wash); }
    .sent i { margin-top: 4px; color: var(--green); }
    .code { text-align: center; font-size: 1.6rem; letter-spacing: 0.4em; font-variant-numeric: tabular-nums; }
    .code-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; }

    .again { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; margin-top: 8px; }
    .again .btn-link, .foot .btn-link { padding-left: 0; padding-right: 0; }
    .foot { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px;
            margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--line); }

    @media (max-width: 480px) {
      .bank-pay { padding: 16px; }
      .head h1 { font-size: 1.45rem; }
      .banks { grid-template-columns: 1fr 1fr; }
    }
  `]
})
export class PayBank implements OnInit {
  private payments = inject(OnlinePaymentsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private reference = this.route.snapshot.queryParamMap.get('ref') ?? '';
  private codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  view = signal<BankPaymentView | null>(null);
  banks = signal<Bank[]>([]);
  loadError = signal('');
  message = signal('');
  messageBad = signal(false);
  busy = signal(false);

  bankCode = signal('');
  account = signal('');   // kept only in this page, to send the code again
  code = signal('');
  editing = signal(false); // "Use another account" while a code is out

  private now = signal(Date.now());
  private sentAt = signal(0);

  step = computed(() => (this.view()?.status === 'CODE_SENT' && !this.editing() ? 2 : 1));
  canSend = computed(() => !!this.bankCode() && this.account().replace(/\s/g, '').length >= 6);
  secondsLeft = computed(() => {
    const until = this.view()?.codeExpiresAt;
    return until ? Math.max(0, Math.round((new Date(until).getTime() - this.now()) / 1000)) : 0;
  });
  resendIn = computed(() => Math.max(0, RESEND_WAIT - Math.round((this.now() - this.sentAt()) / 1000)));

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.account.set('');
      this.code.set('');
    });
  }

  ngOnInit() {
    this.payments.banks().subscribe({ next: b => this.banks.set(b), error: () => this.banks.set([]) });
    this.payments.bankView(this.reference).subscribe({
      next: v => {
        if (this.finished(v)) return;
        this.view.set(v);
        if (v.bankCode) this.bankCode.set(v.bankCode);
      },
      error: (err: HttpErrorResponse) => this.loadError.set(errorText(err))
    });
  }

  sendCode() {
    if (!this.canSend() || this.busy()) return;
    this.busy.set(true);
    this.payments.bankRequestCode(this.reference, this.bankCode(), this.account().replace(/\s/g, '')).subscribe({
      next: v => {
        this.busy.set(false);
        if (this.finished(v)) return;
        this.view.set(v);
        if (v.status === 'CODE_SENT') {
          this.editing.set(false);
          this.code.set('');
          this.sentAt.set(Date.now());
          this.say(v.testMode ? '' : 'Code sent. It can take a minute to arrive.', false);
          setTimeout(() => this.codeInput()?.nativeElement.focus());
        } else {
          this.say(v.message || 'The bank could not send a code. Check the account number.', true);
        }
      },
      error: (err: HttpErrorResponse) => this.failed(err)
    });
  }

  resend() {
    if (this.account()) this.sendCode();
    else this.changeAccount('Type the account number again to get a new code.');
  }

  changeAccount(note = '') {
    this.editing.set(true);
    this.say(note, false);
  }

  pay() {
    if (this.code().length < 4 || this.busy()) return;
    this.busy.set(true);
    this.payments.bankPay(this.reference, this.code()).subscribe({
      next: v => {
        this.busy.set(false);
        if (this.finished(v)) return;
        this.view.set(v);
        this.code.set('');
        this.say(v.message || 'That did not work. Please try again.', true);
        setTimeout(() => this.codeInput()?.nativeElement.focus());
      },
      error: (err: HttpErrorResponse) => this.failed(err)
    });
  }

  cancel() {
    this.busy.set(true);
    this.payments.cancel(this.reference).subscribe({
      next: () => this.toResult(),
      error: () => this.toResult()
    });
  }

  digitsAndSpaces(value: string) {
    return value.replace(/[^\d ]/g, '').slice(0, 24);
  }

  digitsOnly(value: string) {
    return value.replace(/\D/g, '').slice(0, 8);
  }

  clock(seconds: number) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  // Paid, failed, cancelled or expired: the result page says what happened and what to do next.
  // Waiting for the bank's answer stays here, with its own explanation.
  private finished(v: BankPaymentView) {
    if (v.status === 'STARTED' || v.status === 'CODE_SENT') return false;
    if (v.status === 'CHECK_BANK') {
      this.account.set('');
      this.view.set(v);
      return true;
    }
    this.toResult();
    return true;
  }

  private failed(err: HttpErrorResponse) {
    this.busy.set(false);
    this.say(errorText(err), true);
    // the payment may have ended meanwhile (expired, or finished in another tab): show where it stands
    this.payments.bankView(this.reference).subscribe({ next: v => { if (!this.finished(v)) this.view.set(v); }, error: () => {} });
  }

  private say(text: string, bad: boolean) {
    this.message.set(text);
    this.messageBad.set(bad);
  }

  private toResult() {
    this.account.set('');
    this.router.navigate(['/payment/result'], { queryParams: { ref: this.reference }, replaceUrl: true });
  }
}
