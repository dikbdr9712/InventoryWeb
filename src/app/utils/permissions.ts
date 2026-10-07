// WHAT A PERSON CAN BE ALLOWED TO DO.
// Which role has which permission is set with tick boxes in User management and stored on the server;
// the server sends the signed-in person's list at sign-in (AuthService.can uses it).
// ROLE_PERMISSIONS below is only a fallback for a browser that signed in before this change.
// The server has the same table (security/Permissions.java) and refuses what a role may not do.

export type Permission =
  | 'orders.view'       // see the staff order list
  | 'orders.fulfil'     // confirm, ship, deliver and cancel orders
  | 'orders.assign'     // give orders to packers and deliveries to drivers
  | 'payments.verify'   // check payments and confirm that money arrived
  | 'items.manage'      // add and edit products
  | 'stock.restock'     // add stock
  | 'pos.use'           // counter sales and the sales history
  | 'pos.discount'      // give discounts beyond the shop price at the counter
  | 'pos.shifts.manage' // see and close every cashier's cash drawer
  | 'reports.view'      // sales dashboard
  | 'customers.view'    // the customer list and each customer's history
  | 'customers.manage'  // correct customer details and notes
  | 'reviews.manage'    // see all ratings, hide abusive reviews, reply
  | 'messages.view'     // customer messages
  | 'sales.return'      // take items back from a sale and refund them
  | 'users.manage'      // change other people's roles
  | 'marketplace.manage' // approve sellers and riders, commission, delivery settings, payouts
  | 'site.manage'       // the About page: texts, live numbers, team members
  | 'seller.portal'     // a seller's dashboard (My shop)
  | 'seller.products'   // the seller's own products, prices, photos, stock
  | 'seller.orders'     // pack the seller's paid orders
  | 'seller.earnings'   // the seller's earnings and payouts
  | 'rider.portal'      // a driver's dashboard (My deliveries)
  | 'rider.jobs'        // take, pick up and deliver jobs
  | 'rider.earnings';   // the driver's earnings and payouts

const EVERYTHING: Permission[] = [
  'orders.view', 'orders.fulfil', 'orders.assign', 'payments.verify', 'items.manage',
  'stock.restock', 'pos.use', 'pos.discount', 'pos.shifts.manage', 'sales.return', 'reports.view', 'messages.view',
  'customers.view', 'customers.manage', 'reviews.manage', 'users.manage', 'marketplace.manage', 'site.manage'
];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // Runs the whole system
  ADMIN: EVERYTHING,
  // Runs the shop day to day: everything except managing people and marketplace money
  MANAGER: EVERYTHING.filter(p => p !== 'users.manage' && p !== 'marketplace.manage'),
  // Handles stock and getting orders out. Does not verify money or edit the catalogue,
  // so the person who ships an order is never the person who approves its payment.
  CONTROLLER: ['orders.view', 'orders.fulfil', 'stock.restock', 'pos.use', 'messages.view', 'customers.view'],
  // A shopkeeper selling through us
  SELLER: ['seller.portal', 'seller.products', 'seller.orders', 'seller.earnings'],
  // A delivery driver
  RIDER: ['rider.portal', 'rider.jobs', 'rider.earnings'],
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
  'orders.assign': 'Plan and assign orders',
  'payments.verify': 'Verify payments',
  'items.manage': 'Add and edit products',
  'stock.restock': 'Restock',
  'pos.use': 'Use the point of sale',
  'pos.discount': 'Give extra discounts at the counter',
  'pos.shifts.manage': 'Manage all cash drawers',
  'reports.view': 'See the sales dashboard',
  'customers.view': 'See customers and their history',
  'customers.manage': 'Edit customer details',
  'reviews.manage': 'Manage reviews',
  'messages.view': 'Read customer messages',
  'sales.return': 'Take items back from a sale and refund',
  'users.manage': 'Manage users and roles',
  'marketplace.manage': 'Run the marketplace: sellers, riders, commission and payouts',
  'site.manage': 'Edit the website pages (About page and team)',
  'seller.portal': 'Open My shop',
  'seller.products': 'Manage your own products',
  'seller.orders': 'Pack your orders',
  'seller.earnings': 'See your shop earnings and payouts',
  'rider.portal': 'Open My deliveries',
  'rider.jobs': 'Take and deliver jobs',
  'rider.earnings': 'See your delivery earnings and payouts'
};
