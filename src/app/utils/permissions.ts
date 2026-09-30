// WHO CAN DO WHAT. This is the only place to change when a role's access changes.
// The menu, the pages and the buttons all read from this table.

export type Permission =
  | 'orders.view'       // see the staff order list
  | 'orders.fulfil'     // confirm, ship, deliver and cancel orders
  | 'payments.verify'   // check payments and confirm that money arrived
  | 'items.manage'      // add and edit products
  | 'stock.restock'     // add stock
  | 'pos.use'           // counter sales and the sales history
  | 'reports.view'      // sales dashboard
  | 'messages.view'     // customer messages
  | 'users.manage';     // change other people's roles

const EVERYTHING: Permission[] = [
  'orders.view', 'orders.fulfil', 'payments.verify', 'items.manage',
  'stock.restock', 'pos.use', 'reports.view', 'messages.view', 'users.manage'
];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // Runs the whole system
  ADMIN: EVERYTHING,

  // Runs the shop day to day: everything except managing other users
  MANAGER: EVERYTHING.filter(p => p !== 'users.manage'),

  // Handles stock and getting orders out. Does not verify money or edit the catalogue,
  // so the person who ships an order is never the person who approves its payment.
  CONTROLLER: ['orders.view', 'orders.fulfil', 'stock.restock', 'pos.use', 'messages.view'],

  // Customers: no staff tools at all
  USER: []
};

export function permissionsFor(role: string | null | undefined): Permission[] {
  return ROLE_PERMISSIONS[(role ?? '').toUpperCase()] ?? [];
}

// Plain-language names for each permission, for showing to people
export const PERMISSION_LABELS: Record<Permission, string> = {
  'orders.view': 'See the order list',
  'orders.fulfil': 'Confirm, ship and deliver orders',
  'payments.verify': 'Verify payments',
  'items.manage': 'Add and edit products',
  'stock.restock': 'Restock',
  'pos.use': 'Use the point of sale',
  'reports.view': 'See the sales dashboard',
  'messages.view': 'Read customer messages',
  'users.manage': 'Manage users and roles'
};
