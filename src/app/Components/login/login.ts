import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { AuthLayout } from '../auth-layout/auth-layout';
import { errorText } from '../../utils/http-error';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, AuthLayout],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toasts = inject(ToastService);

  email = '';
  password = '';
  showPassword = signal(false);
  loading = signal(false);
  submitted = signal(false); // field errors only show after the first attempt
  formError = signal('');

  // Where to go after signing in: the page the visitor came from, else Products
  returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

  errors() {
    const e: { email?: string; password?: string } = {};
    const email = this.email.trim();
    if (!email) e.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Enter a valid email address.';
    if (!this.password) e.password = 'Enter your password.';
    return e;
  }

  submit() {
    if (this.loading()) return;

    this.formError.set('');
    this.submitted.set(true);
    if (Object.keys(this.errors()).length > 0) return;

    this.loading.set(true);
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: user => {
        this.toasts.success(`Welcome back, ${user.name.split(' ')[0]}.`);
        // only follow paths inside this site
        const target = this.returnUrl && this.returnUrl.startsWith('/') && !this.returnUrl.startsWith('//')
          ? this.returnUrl
          : '/products';
        this.router.navigateByUrl(target);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.formError.set(
          err.status === 0
            ? errorText(err)
            : err.status >= 400 && err.status < 500
              ? 'That email and password do not match. Please check them and try again.'
              : 'Something went wrong on our side. Please try again in a moment.'
        );
      }
    });
  }
}
