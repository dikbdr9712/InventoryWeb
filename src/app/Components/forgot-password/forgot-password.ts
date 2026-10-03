import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { AuthLayout } from '../auth-layout/auth-layout';
import { errorText } from '../../utils/http-error';

// "Forgot password": we email a link to choose a new one. The answer never says whether the email has an account.
@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout title="Forgot your password?" subtitle="We will email you a link to choose a new one.">
      @if (sent()) {
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
  `]
})
export class ForgotPassword {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

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
