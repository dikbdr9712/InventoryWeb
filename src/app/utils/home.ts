import { AuthService } from '../services/auth';

// Where a person starts after signing in, and what "My dashboard" opens.
// Decided by what they may do, so custom roles (e.g. Cashier) land in the right place too.
export function homeFor(auth: AuthService): { path: string; label: string; icon: string } {
  if (auth.can('seller.portal')) return { path: '/seller', label: 'My shop', icon: 'fa-store' };
  if (auth.can('rider.portal')) return { path: '/rider', label: 'My deliveries', icon: 'fa-motorcycle' };
  if (auth.can('reports.view')) return { path: '/admin/dashboard', label: 'Dashboard', icon: 'fa-chart-line' };
  if (auth.can('pos.use')) return { path: '/pos', label: 'Point of sale', icon: 'fa-cash-register' };
  if (auth.can('orders.view')) return { path: '/admin/orders', label: 'Orders', icon: 'fa-list-check' };
  if (auth.can('payments.verify')) return { path: '/order-verification', label: 'Verify payments', icon: 'fa-circle-check' };
  if (auth.can('marketplace.manage')) return { path: '/admin/marketplace', label: 'Marketplace', icon: 'fa-handshake' };
  if (auth.can('users.manage')) return { path: '/admin/users', label: 'People & access', icon: 'fa-users' };
  return { path: '/products', label: 'Shop', icon: 'fa-store' };
}
