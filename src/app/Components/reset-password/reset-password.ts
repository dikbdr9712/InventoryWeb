import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { AuthLayout } from '../auth-layout/auth-layout';
import { errorText } from '../../utils/http-error';

const MIN_LENGTH = 6;

// The page the email link opens: choose a new password. The link works once, for 30 minutes.
@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout title="Choose a new password" subtitle="You will be signed out everywhere else.">
      @switch (state()) {
        @case ('checking') {
          <p class="auth-alt">Checking your link...</p>
        }
        @case ('invalid') {
          <div class="alert alert-warning" role="alert">
            <strong>This link has expired or was already used.</strong> Links work once, for 30 minutes.
          </div>
          <a routerLink="/forgot-password" class="btn btn-primary btn-lg auth-submit">Send me a new link</a>
          <p class="auth-alt"><a routerLink="/login">Back to sign in</a></p>
        }
        @default {
          <form (ngSubmit)="submit()" novalidate>
            @if (formError()) {
              <div class="alert alert-danger" role="alert">{{ formError() }}</div>
            }
            <div class="auth-field">
              <label for="newPassword">New password</label>
              <div class="pw">
                <input id="newPassword" name="newPassword" class="form-control" autocomplete="new-password"
                       [type]="show() ? 'text' : 'password'" [class.is-invalid]="submitted() && errors().password"
                       [(ngModel)]="password" />
                <button type="button" (click)="show.set(!show())" [attr.aria-pressed]="show()">{{ show() ? 'Hide' : 'Show' }}</button>
              </div>
              @if (submitted() && errors().password) {
                <p class="auth-err">{{ errors().password }}</p>
              } @else {
                <p class="hint">At least {{ minLength }} characters. A short sentence is easy to remember and hard to guess.</p>
              }
            </div>
            <div class="auth-field">
              <label for="confirm">Type it again</label>
              <input id="confirm" name="confirm" class="form-control" autocomplete="new-password"
                     [type]="show() ? 'text' : 'password'" [class.is-invalid]="submitted() && errors().confirm"
                     [(ngModel)]="confirm" />
              @if (submitted() && errors().confirm) {
                <p class="auth-err">{{ errors().confirm }}</p>
              }
            </div>
            <button type="submit" class="btn btn-primary btn-lg auth-submit" [disabled]="saving()">
              @if (saving()) {
                <span class="spinner-border spinner-border-sm" role="status"></span> Saving...
              } @else {
                Save new password
              }
            </button>
          </form>
        }
      }
    </app-auth-layout>
  `,
  styles: [`.hint { margin: 6px 0 0; color: var(--muted); font-size: 0.85rem; }`]
})
export class ResetPassword implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toasts = inject(ToastService);

  readonly minLength = MIN_LENGTH;
  private token = this.route.snapshot.queryParamMap.get('token') ?? '';
  state = signal<'checking' | 'invalid' | 'ready'>('checking');
  password = '';
  confirm = '';
  show = signal(false);
  saving = signal(false);
  submitted = signal(false);
  formError = signal('');

  ngOnInit() {
    if (!this.token) {
      this.state.set('invalid');
      return;
    }
    this.auth.checkResetLink(this.token).subscribe({
      next: r => this.state.set(r.valid ? 'ready' : 'invalid'),
      error: () => this.state.set('invalid')
    });
  }

  errors() {
    const e: { password?: string; confirm?: string } = {};
    if (this.password.length < MIN_LENGTH) e.password = `Use at least ${MIN_LENGTH} characters.`;
    if (this.confirm !== this.password) e.confirm = 'The two passwords are not the same.';
    return e;
  }

  submit() {
    this.submitted.set(true);
    this.formError.set('');
    if (Object.keys(this.errors()).length > 0 || this.saving()) return;
    this.saving.set(true);
    this.auth.resetPassword(this.token, this.password).subscribe({
      next: () => {
        this.saving.set(false);
        if (this.auth.isLoggedIn()) this.auth.logout(); // this browser starts fresh too
        this.toasts.success('Password changed. Sign in with your new password.');
        this.router.navigate(['/login']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const text = errorText(err);
        if (/expired|already used/i.test(text)) this.state.set('invalid');
        else this.formError.set(text);
      }
    });
  }
}
