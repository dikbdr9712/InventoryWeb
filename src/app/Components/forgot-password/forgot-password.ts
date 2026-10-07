import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { AuthLayout } from '../auth-layout/auth-layout';
import { errorText } from '../../utils/http-error';
import { SHOP } from '../../utils/shop-info';

// "Forgot password": we email a link to choose a new one. The answer never says whether the email has an account.
// When the server cannot send email (no email account set up yet), the page says how to get help from the shop
// instead of promising an email that never comes: staff reset it in People & access.
@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout title="Forgot your password?"
                     [subtitle]="emailWorks() === false ? 'We will help you get back into your account.' : 'We will email you a link to choose a new one.'">
      @if (emailWorks() === false) {
        <div class="help" role="status">
          <i class="fas fa-headset"></i>
          <p><strong>Ask us to reset it.</strong></p>
          <p>Resetting by email is not available yet. Call or message the shop from the phone number or email of your
             account, and we will give you a new temporary password straight away.</p>
          <p class="ways">
            <a class="btn btn-primary" [href]="'tel:' + shop.phone"><i class="fas fa-phone"></i> Call {{ shop.phone }}</a>
            <a class="btn btn-secondary" routerLink="/contact" [queryParams]="{ subject: 'Forgot my password' }"><i class="fas fa-envelope"></i> Send a message</a>
          </p>
          <p class="small">Sign in with the temporary password, then choose your own in My profile.</p>
        </div>
        <p class="auth-alt">Remembered it? <a routerLink="/login">Sign in</a></p>
      } @else if (sent()) {
        <div class="sent" role="status">
          <i class="fas fa-envelope-circle-check"></i>
          <p><strong>Check your email.</strong></p>
          <p>
            If an account uses <strong>{{ email.trim() }}</strong>, a link is on its way. It works for 30 minutes.
            Look in the spam folder too.
          </p>
        </div>
        <button type="button" class="btn btn-secondary auth-submit" (click)="sent.set(false)">Send it again</button>
        <p class="auth-alt"><a routerLink="/login">Back to sign in</a></p>
      } @else {
        <form (ngSubmit)="submit()" novalidate>
          @if (formError()) {
            <div class="alert alert-danger" role="alert">{{ formError() }}</div>
          }
          <div class="auth-field">
            <label for="email">Email of your account</label>
            <input id="email" name="email" type="email" class="form-control" autocomplete="username"
                   [class.is-invalid]="submitted() && emailError()" [(ngModel)]="email" />
            @if (submitted() && emailError()) {
              <p class="auth-err">{{ emailError() }}</p>
            }
          </div>
          <button type="submit" class="btn btn-primary btn-lg auth-submit" [disabled]="loading()">
            @if (loading()) {
              <span class="spinner-border spinner-border-sm" role="status"></span> Sending...
            } @else {
              Email me a link
            }
          </button>
          <p class="auth-alt">Remembered it? <a routerLink="/login">Sign in</a></p>
        </form>
      }
    </app-auth-layout>
  `,
  styles: [`
    .sent { margin-bottom: 16px; padding: 16px; border-radius: 12px; background: var(--green-soft); color: var(--green-deep); }
    .sent i { font-size: 1.8rem; margin-bottom: 6px; }
    .sent p { margin: 0 0 6px; }
    .sent p:last-child { margin: 0; }
    .help { margin-bottom: 16px; padding: 16px; border-radius: 12px; background: var(--blue-soft); color: var(--ink); }
    .help i { font-size: 1.8rem; margin-bottom: 6px; color: var(--blue); }
    .help p { margin: 0 0 8px; }
    .help .ways { display: flex; flex-wrap: wrap; gap: 8px; }
    .help .ways .btn { display: inline-flex; align-items: center; gap: 6px; }
    .help .small { margin: 0; font-size: 0.85rem; color: var(--muted); }
  `]
})
export class ForgotPassword implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  readonly shop = SHOP;
  emailWorks = signal<boolean | null>(null); // null until the server answers: the form shows meanwhile

  ngOnInit() {
    this.auth.resetByEmailAvailable().subscribe({ next: r => this.emailWorks.set(r.email), error: () => this.emailWorks.set(null) });
  }

  email = this.route.snapshot.queryParamMap.get('email') ?? '';
  loading = signal(false);
  submitted = signal(false);
  sent = signal(false);
  formError = signal('');

  emailError() {
    const email = this.email.trim();
    if (!email) return 'Enter your email address.';
    if (!/^\S+@\S+\.\S+$/.test(email)) return 'Enter a valid email address.';
    return '';
  }

  submit() {
    this.submitted.set(true);
    this.formError.set('');
    if (this.emailError() || this.loading()) return;
    this.loading.set(true);
    this.auth.forgotPassword(this.email.trim()).subscribe({
      next: () => {
        this.loading.set(false);
        this.sent.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.formError.set(err.status === 0 ? 'Could not reach the server. Please try again.' : errorText(err));
      }
    });
  }
}
