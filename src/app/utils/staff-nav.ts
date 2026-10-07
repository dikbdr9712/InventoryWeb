import { Permission } from './permissions';

export interface StaffLink {
  path: string;
  label: string;
  icon: string;
  permission: Permission; // who may see it: see utils/permissions.ts
  hint?: string;          // one line under the label in the staff menu
  query?: Record<string, string>;
}

// Staff tools, grouped by what the person is trying to do.
// Add or move a tool here and both the staff bar and the phone menu follow.
// In the staff bar a group with several tools becomes a small menu; a group with one tool is a plain link.
export const STAFF_GROUPS: { title: string; icon: string; items: StaffLink[] }[] = [
  {
    title: 'My shop',
    icon: 'fa-store',
    items: [{ path: '/seller', label: 'My shop', icon: 'fa-store', permission: 'seller.portal' }]
  },
  {
    title: 'My deliveries',
    icon: 'fa-motorcycle',
    items: [{ path: '/rider', label: 'My deliveries', icon: 'fa-motorcycle', permission: 'rider.portal' }]
  },
  {
    title: 'Counter',
    icon: 'fa-cash-register',
    items: [
      { path: '/pos', label: 'Point of sale', icon: 'fa-cash-register', permission: 'pos.use', hint: 'Sell at the counter' },
      { path: '/pos-history', label: 'Sales history', icon: 'fa-clock-rotate-left', permission: 'pos.use', hint: 'Counter sales, receipts and returns' },
      { path: '/pos-history', label: 'Cash drawers', icon: 'fa-money-bill-wave', permission: 'pos.use', hint: 'Shifts, cash counts and shortages', query: { view: 'drawers' } }
    ]
  },
  {
    title: 'Orders',
    icon: 'fa-list-check',
    items: [
      { path: '/admin/orders', label: 'Orders', icon: 'fa-list-check', permission: 'orders.view', hint: 'Payment to door: who has each order, what is late' },
      { path: '/order-verification', label: 'Verify payments', icon: 'fa-circle-check', permission: 'payments.verify', hint: 'Check payments and bank answers' }
    ]
  },
  {
    title: 'Products',
    icon: 'fa-boxes-stacked',
    items: [
      { path: '/products/new', label: 'Add product', icon: 'fa-plus', permission: 'items.manage', hint: 'A new product for the shop' },
      { path: '/restock', label: 'Restock', icon: 'fa-boxes-stacked', permission: 'stock.restock', hint: 'Stock that arrived' },
      { path: '/admin/stock', label: 'Stock & expiry', icon: 'fa-calendar-xmark', permission: 'stock.restock', hint: 'Batches, expiry dates, write-offs, counts' }
    ]
  },
  {
    title: 'Customers',
    icon: 'fa-address-book',
    items: [
      { path: '/admin/customers', label: 'Customers', icon: 'fa-address-book', permission: 'customers.view', hint: 'Who buys from us, and their history' },
      { path: '/admin/messages', label: 'Customer messages', icon: 'fa-envelope', permission: 'messages.view', hint: 'Messages from the Contact page' },
      { path: '/admin/reviews', label: 'Reviews', icon: 'fa-star', permission: 'reviews.manage', hint: 'Ratings of products, service and drivers' }
    ]
  },
  {
    title: 'Marketplace',
    icon: 'fa-handshake',
    items: [{ path: '/admin/marketplace', label: 'Sellers & drivers', icon: 'fa-handshake', permission: 'marketplace.manage', hint: 'Applications, commission, payouts' }]
  },
  {
    title: 'Reports',
    icon: 'fa-chart-line',
    items: [{ path: '/admin/dashboard', label: 'Sales dashboard', icon: 'fa-chart-line', permission: 'reports.view' }]
  },
  {
    title: 'People',
    icon: 'fa-users',
    items: [{ path: '/admin/users', label: 'People & access', icon: 'fa-users', permission: 'users.manage' }]
  },
  {
    title: 'Website',
    icon: 'fa-globe',
    items: [{ path: '/admin/about', label: 'About page', icon: 'fa-pen-to-square', permission: 'site.manage', hint: 'Texts, live numbers and the team' }]
  }
];
