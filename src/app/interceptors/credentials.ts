import { HttpInterceptorFn } from '@angular/common/http';

// Same as fetch(..., { credentials: 'include' }) in your old JS, but for every request.
export const credentialsInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ withCredentials: true }));
