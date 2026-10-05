import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';

// The server remembers who is signed in, and forgets everyone when it restarts (or after a while of inactivity).
// The browser does not know that, so the app would still look signed in while the server says "who are you?" (401).
// This notices that, signs the person out of the app, and sends them to the sign-in page.
// After signing in they come back to the page they were on.

let handling = false; // several requests can fail together: only react once

export const sessionExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toasts = inject(ToastService);

  return next(req).pipe(
    catchError((error: unknown) => {
      const sessionEnded =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        auth.isLoggedIn() &&              // the app thinks the person is signed in
        !req.url.includes('/api/auth/');  // a wrong password at login is a different thing

      if (sessionEnded && !handling) {
        handling = true;
        const backTo = router.url;
        // never "come back to" the sign-in pages themselves
        const authPage = /^\/(login|signup|register|forgot-password|reset-password)(\/|\?|$)/.test(backTo);
        auth.logout();
        toasts.info('Your session has ended. Please sign in again.');
        router.navigate(['/login'], authPage ? {} : { queryParams: { returnUrl: backTo } }).finally(() => (handling = false));
      }
      return throwError(() => error); // the screen that asked still gets its error
    })
  );
};