import { Permission } from './permissions';

export interface StaffLink {
  path: string;
  label: string;
  icon: string;
  permission: Permission; // who may see it: see utils/permissions.ts
}

// Staff tools, grouped by what the person is trying to do.
// Add or move a tool here and both the staff bar and the phone menu follow.
export const STAFF_GROUPS: { title: string; items: StaffLink[] }[] = [
  {
    title: 'Sell',
    items: [
      { path: '/pos', label: 'Point of sale', icon: 'fa-cash-register', permission: 'pos.use' },
      { path: '/pos-history', label: 'Sales history', icon: 'fa-clock-rotate-left', permission: 'pos.use' }
    ]
  },
  {
    title: 'Orders',
    items: [
      { path: '/admin/orders', label: 'Order list', icon: 'fa-list-check', permission: 'orders.view' },
      { path: '/order-verification', label: 'Verify payments', icon: 'fa-circle-check', permission: 'payments.verify' }
    ]
  },
  {
    title: 'Catalog',
    items: [
      { path: '/products/new', label: 'Add product', icon: 'fa-plus', permission: 'items.manage' },
      { path: '/restock', label: 'Restock', icon: 'fa-boxes-stacked', permission: 'stock.restock' }
    ]
  },
  {
    title: 'Customers',
    items: [{ path: '/admin/messages', label: 'Customer messages', icon: 'fa-envelope', permission: 'messages.view' }]
  },
  {
    title: 'Insights',
    items: [{ path: '/admin/dashboard', label: 'Sales dashboard', icon: 'fa-chart-line', permission: 'reports.view' }]
  },
  {
    title: 'People',
    items: [{ path: '/admin/users', label: 'User management', icon: 'fa-users', permission: 'users.manage' }]
  }
];
