import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { LegalService } from '../../services/legal';
import { ToastService } from '../../services/toast';
import { AuthLayout } from '../auth-layout/auth-layout';
import { errorText } from '../../utils/http-error';

@Component({
  selector: 'app-signup',
  imports: [FormsModule, RouterLink, AuthLayout],
  templateUrl: './signup.html',
  styleUrl: './signup.css'
})
export class Signup {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toasts = inject(ToastService);
  private legal = inject(LegalService);

  // the current Terms of Use and Privacy: the version ticked is sent and recorded by the server
  termsVersion = signal<number | null>(null);
  termsError = signal(false);
  agreeTerms = false;

  constructor() {
    this.loadTerms();
  }

  loadTerms() {
    this.termsError.set(false);
    this.legal.current('CUSTOMER').subscribe({ next: t => this.termsVersion.set(t.version), error: () => this.termsError.set(true) });
  }

  form = { name: '', email: '', phone: '', password: '', confirm: '' };
  showPassword = signal(false);
  loading = signal(false);
  submitted = signal(false);
  formError = signal('');

  returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

  errors() {
    const e: { name?: string; email?: string; phone?: string; password?: string; confirm?: string; terms?: string } = {};
    const f = this.form;
    if (!f.name.trim()) e.name = 'Enter your full name.';
    if (!f.email.trim()) e.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
    if (!/^[0-9]{8}$/.test(f.phone.trim())) e.phone = 'Enter an 8-digit phone number.';
    if (f.password.length < 6) e.password = 'Use at least 6 characters.';
    if (f.confirm !== f.password) e.confirm = 'The passwords do not match.';
    if (!this.agreeTerms) e.terms = 'Please read and accept the Terms of Use and Privacy.';
    else if (!this.termsVersion()) e.terms = 'The Terms of Use could not be loaded. Press "Load again" and try once more.';
    return e;
  }

  submit() {
    if (this.loading()) return;

    this.formError.set('');
    this.submitted.set(true);
    if (Object.keys(this.errors()).length > 0) return;

    const email = this.form.email.trim();
    const password = this.form.password;

    this.loading.set(true);
    this.auth.signup({
      name: this.form.name.trim(),
      email,
      phone: this.form.phone.trim(),
      password,
      acceptedTermsVersion: this.termsVersion()
    }).subscribe({
      // Sign the new customer in straight away, so they do not have to type it all again
      next: () => {
        this.auth.login(email, password).subscribe({
          next: user => {
            this.toasts.success(`Welcome, ${user.name.split(' ')[0]}. Your account is ready.`);
            const target = this.returnUrl && this.returnUrl.startsWith('/') && !this.returnUrl.startsWith('//')
              ? this.returnUrl
              : '/products';
            this.router.navigateByUrl(target);
          },
          error: () => {
            this.toasts.success('Your account is ready. Please sign in.');
            this.router.navigate(['/login']);
          }
        });
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.formError.set(err.status === 0 ? errorText(err) : 'We could not create your account. ' + errorText(err));
      }
    });
  }
}
