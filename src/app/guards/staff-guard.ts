import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { Permission } from '../utils/permissions';

// Use on a route to require one permission:  canActivate: [permissionGuard('payments.verify')]
export function permissionGuard(permission: Permission): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const toasts = inject(ToastService);

    if (auth.can(permission)) return true;

    if (!auth.isLoggedIn()) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }

    toasts.error('Your account does not have access to that page.');
    return router.createUrlTree(['/']);
  };
}

// Kept for any route still using the older role-based guards
function requireRoles(roles: string[], deniedMessage: string): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const toasts = inject(ToastService);

    if (auth.isLoggedIn() && roles.includes(auth.role() ?? '')) return true;
    if (!auth.isLoggedIn()) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }
    toasts.error(deniedMessage);
    return router.createUrlTree(['/']);
  };
}

export const staffGuard = requireRoles(['ADMIN', 'MANAGER', 'CONTROLLER'], 'Only staff accounts can open this page.');
export const managerGuard = requireRoles(['ADMIN', 'MANAGER'], 'Only admins and managers can open this page.');
export const adminGuard = requireRoles(['ADMIN'], 'Only administrators can open this page.');
