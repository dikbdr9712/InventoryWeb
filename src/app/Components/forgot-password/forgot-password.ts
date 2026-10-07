import { Component, DestroyRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule, NgModel } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, ResetMethod, ResetWays } from '../../services/auth';
import { AuthLayout } from '../auth-layout/auth-layout';
import { errorText } from '../../utils/http-error';
import { ShopDetails } from '../../services/shop-details';

const MIN_LENGTH = 6;
type Step = 'start' | 'code' | 'password' | 'done';

// "Forgot password", done by the person themselves:
//   1. choose email or text message, type the email or phone number of the account: a 6-digit code goes there
//   2. type the code (the email also holds a link that opens /reset-password)
//   3. choose the new password, then sign in.
// The answers never say whether an email or number has an account. A way the server cannot use is not offered;
// when neither works the page says how to get help from the shop (staff reset it in People & access).
@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink, AuthLayout],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css'
})
export class ForgotPassword implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly shop = inject(ShopDetails);
  readonly minLength = MIN_LENGTH;

  ways = signal<ResetWays | null>(null); // null until the server answers: both ways are offered meanwhile
  noWay = computed(() => { const w = this.ways(); return !!w && !w.email && !w.sms; });
  step = signal<Step>('start');
  method = signal<ResetMethod>('email');

  email = this.route.snapshot.queryParamMap.get('email') ?? '';
  phone = '';
  code = '';
  password = '';
  confirm = '';
  show = signal(false);
  loading = signal(false);
  submitted = signal(false); // field errors show after the first try
  formError = signal('');
  resendIn = signal(0);
  accountEmail = signal('');
  private codeBox = viewChild<NgModel>('codeBox');
  private ticket = ''; // from the right code; kept only here, for the new password
  private passwordShownAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  title = computed(() => {
    switch (this.step()) {
      case 'code': return 'Enter the code';
      case 'password': return 'Choose a new password';
      case 'done': return 'Password changed';
      default: return 'Forgot your password?';
    }
  });
  subtitle = computed(() => {
    if (this.noWay()) return 'We will help you get back into your account.';
    switch (this.step()) {
      case 'code': return this.method() === 'email' ? 'Check your email.' : 'Check the text messages on your phone.';
      case 'password': return 'You will be signed out everywhere else.';
      case 'done': return 'You can sign in again.';
      default: return 'We will send you a code to choose a new one.';
    }
  });

  ngOnInit() {
    this.auth.resetWays().subscribe({
      next: w => {
        this.ways.set(w);
        if (!w.email && w.sms) this.method.set('sms');
      },
      error: () => this.ways.set(null)
    });
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  canUse(m: ResetMethod) {
    const w = this.ways();
    return !w || w[m];
  }

  choose(m: ResetMethod) {
    if (!this.canUse(m)) return;
    this.method.set(m);
    this.submitted.set(false);
    this.formError.set('');
    this.focus(m === 'email' ? 'fp-email' : 'fp-phone');
  }

  // ---------- Step 1: send the code ----------

  phoneDigits() {
    let d = this.phone.replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('975')) d = d.slice(3);
    return d;
  }

  // Where the code went, as the person typed it
  target() {
    if (this.method() === 'email') return this.email.trim();
    const d = this.phoneDigits();
    return `+975 ${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)} ${d.slice(6)}`;
  }

  addressError() {
    if (this.method() === 'email') {
      const e = this.email.trim();
      if (!e) return 'Enter your email address.';
      if (!/^\S+@\S+\.\S+$/.test(e)) return 'Enter a valid email address.';
      return '';
    }
    const d = this.phoneDigits();
    if (!d) return 'Enter your phone number.';
    if (d.length !== 8) return 'Enter the 8-digit phone number of your account.';
    return '';
  }

  sendCode(again = false) {
    this.submitted.set(true);
    this.formError.set('');
    if (this.addressError() || this.loading() || (again && this.resendIn() > 0)) return;
    this.loading.set(true);
    const to = this.method() === 'email' ? this.email.trim() : this.phoneDigits();
    this.auth.sendResetCode(this.method(), to).subscribe({
      next: r => {
        this.loading.set(false);
        this.submitted.set(false);
        this.clearCode();
        this.step.set('code');
        this.startTimer(r.resendAfter || 60);
        this.focus('fp-code');
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.formError.set(this.problem(err));
      }
    });
  }

  // ---------- Step 2: the code ----------

  codeError() {
    const c = this.code.replace(/\D/g, '');
    if (!c) return 'Enter the code from the message.';
    if (c.length !== 6) return 'The code has 6 digits.';
    return '';
  }

  // Pasted or typed in full: check it straight away
  codeTyped(value: string) {
    if ((value ?? '').replace(/\D/g, '').length === 6 && !this.loading()) this.verify();
  }

  verify() {
    this.submitted.set(true);
    this.formError.set('');
    if (this.codeError() || this.loading()) return;
    this.loading.set(true);
    const to = this.method() === 'email' ? this.email.trim() : this.phoneDigits();
    this.auth.verifyResetCode(this.method(), to, this.code.replace(/\D/g, '')).subscribe({
      next: r => {
        this.loading.set(false);
        this.submitted.set(false);
        this.ticket = r.token;
        this.passwordShownAt = Date.now();
        this.step.set('password');
        this.focus('fp-new');
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.submitted.set(false);
        this.clearCode();
        this.formError.set(this.problem(err));
        this.focus('fp-code');
      }
    });
  }

  // Back to step 1 (another email or number, or the other way). The wait before a new code keeps counting.
  startOver() {
    this.step.set('start');
    this.clearCode();
    this.submitted.set(false);
    this.formError.set('');
  }

  // ---------- Step 3: the new password ----------

  passwordErrors() {
    const e: { password?: string; confirm?: string } = {};
    if (this.password.length < MIN_LENGTH) e.password = `Use at least ${MIN_LENGTH} characters.`;
    if (this.confirm !== this.password) e.confirm = 'The two passwords are not the same.';
    return e;
  }

  savePassword() {
    // an Enter meant for the code (it was checked as soon as it was complete) lands here: ignore it
    if (!this.password && !this.confirm && Date.now() - this.passwordShownAt < 1500) return;
    this.submitted.set(true);
    this.formError.set('');
    if (Object.keys(this.passwordErrors()).length > 0 || this.loading()) return;
    this.loading.set(true);
    this.auth.resetPassword(this.ticket, this.password).subscribe({
      next: r => {
        this.loading.set(false);
        this.ticket = '';
        this.password = '';
        this.confirm = '';
        this.accountEmail.set(r.email ?? '');
        if (this.auth.isLoggedIn()) this.auth.logout(); // this browser starts fresh too
        this.stopTimer();
        this.step.set('done');
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        const text = this.problem(err);
        if (/expired|already used/i.test(text)) {
          // more than 15 minutes since the code: start again
          this.ticket = '';
          this.startOver();
          this.formError.set('That took too long and the code has expired. Ask for a new code.');
        } else {
          this.formError.set(text);
        }
      }
    });
  }

  signIn() {
    // the email goes to the sign-in page in the browser's memory, not in the address
    this.router.navigate(['/login'], { state: { email: this.accountEmail() } });
  }

  // ---------- Helpers ----------

  // Through the form control: a code pasted in one go would otherwise stay on screen
  private clearCode() {
    this.code = '';
    this.codeBox()?.control.setValue('', { emitViewToModelChange: false });
  }

  private problem(err: HttpErrorResponse) {
    return err.status === 0 ? 'Could not reach the server. Please try again.' : errorText(err);
  }

  private startTimer(seconds: number) {
    this.stopTimer();
    this.resendIn.set(seconds);
    this.timer = setInterval(() => {
      const left = this.resendIn() - 1;
      this.resendIn.set(Math.max(0, left));
      if (left <= 0) this.stopTimer();
    }, 1000);
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private focus(id: string) {
    setTimeout(() => document.getElementById(id)?.focus());
  }
}
