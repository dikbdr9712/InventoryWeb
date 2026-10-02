import { Routes } from '@angular/router';

// The home page is part of the first download; every other page is downloaded only when it is opened
// (loadComponent), so the first visit stays small and fast.
import { Home } from './Components/home/home';

// Guards
import { authGuard } from './guards/auth-guard';
import { permissionGuard } from './guards/staff-guard';

export const routes: Routes = [
  // ---------- Public ----------
  { path: '', component: Home },
  { path: 'about', loadComponent: () => import('./Components/about/about').then(m => m.About) },
  { path: 'services', loadComponent: () => import('./Components/our-services/our-services').then(m => m.OurServices) },
  { path: 'reviews', loadComponent: () => import('./Components/product-rating/product-rating').then(m => m.ProductRating) },
  { path: 'contact', loadComponent: () => import('./Components/contact/contact').then(m => m.Contact) },
  { path: 'login', loadComponent: () => import('./Components/login/login').then(m => m.Login) },
  { path: 'signup', loadComponent: () => import('./Components/signup/signup').then(m => m.Signup) },
  { path: 'sell', loadComponent: () => import('./Components/partner-join/partner-join').then(m => m.PartnerJoin), data: { kind: 'seller' } },
  { path: 'deliver', loadComponent: () => import('./Components/partner-join/partner-join').then(m => m.PartnerJoin), data: { kind: 'rider' } },
  { path: 'terms', loadComponent: () => import('./Components/terms-page/terms-page').then(m => m.TermsPage) },          // Terms of Use and Privacy
  { path: 'terms/:type', loadComponent: () => import('./Components/terms-page/terms-page').then(m => m.TermsPage) },    // seller, driver

  // ---------- Products (specific paths BEFORE 'products/:id') ----------
  { path: 'products', loadComponent: () => import('./Components/product-list/product-list').then(m => m.ProductList) },
  { path: 'products/new', loadComponent: () => import('./Components/product-form/product-form').then(m => m.ProductForm), canActivate: [permissionGuard('items.manage')] },
  { path: 'products/edit/:id', loadComponent: () => import('./Components/product-form/product-form').then(m => m.ProductForm), canActivate: [permissionGuard('items.manage')] },
  { path: 'products/:id', loadComponent: () => import('./Components/product-detail/product-detail').then(m => m.ProductDetail) },

  // ---------- Shopping ----------
  { path: 'cart', loadComponent: () => import('./Components/cart/cart').then(m => m.Cart) },
  { path: 'payment', loadComponent: () => import('./Components/payment/payment').then(m => m.Payment), canActivate: [authGuard] },
  { path: 'order-success', loadComponent: () => import('./Components/order-success/order-success').then(m => m.OrderSuccess), canActivate: [authGuard] },

  // ---------- Customer account ----------
  { path: 'profile', loadComponent: () => import('./Components/profile/profile').then(m => m.Profile), canActivate: [authGuard] },
  { path: 'orders', loadComponent: () => import('./Components/my-orders/my-orders').then(m => m.MyOrders), canActivate: [authGuard] },
  { path: 'orders/:id', loadComponent: () => import('./Components/order-details/order-details').then(m => m.OrderDetails), canActivate: [authGuard] },

  // ---------- Staff ----------
  { path: 'restock', loadComponent: () => import('./Components/restock/restock').then(m => m.Restock), canActivate: [permissionGuard('stock.restock')] },
  { path: 'pos', loadComponent: () => import('./Components/pos/pos').then(m => m.Pos), canActivate: [permissionGuard('pos.use')] },
  { path: 'pos-history', loadComponent: () => import('./Components/pos-history/pos-history').then(m => m.PosHistory), canActivate: [permissionGuard('pos.use')] },
  { path: 'admin/orders', loadComponent: () => import('./Components/order-list/order-list').then(m => m.OrderList), canActivate: [permissionGuard('orders.view')] },
  { path: 'order-verification', loadComponent: () => import('./Components/order-verification/order-verification').then(m => m.OrderVerification), canActivate: [permissionGuard('payments.verify')] },
  { path: 'admin/messages', loadComponent: () => import('./Components/contact-messages/contact-messages').then(m => m.ContactMessages), canActivate: [permissionGuard('messages.view')] },

  { path: 'admin/dashboard', loadComponent: () => import('./Components/sales-dashboard/sales-dashboard').then(m => m.SalesDashboard), canActivate: [permissionGuard('reports.view')] },

  { path: 'admin/customers', loadComponent: () => import('./Components/customers/customers').then(m => m.Customers), canActivate: [permissionGuard('customers.view')] },
  { path: 'admin/deliveries', loadComponent: () => import('./Components/deliveries/deliveries').then(m => m.Deliveries), canActivate: [permissionGuard('orders.view')] },

  // ---------- Sellers and riders ----------
  { path: 'seller', loadComponent: () => import('./Components/seller-hub/seller-hub').then(m => m.SellerHub), canActivate: [permissionGuard('seller.portal')] },
  { path: 'rider', loadComponent: () => import('./Components/rider-hub/rider-hub').then(m => m.RiderHub), canActivate: [permissionGuard('rider.portal')] },

  // ---------- Admin only ----------
  { path: 'admin/marketplace', loadComponent: () => import('./Components/marketplace-admin/marketplace-admin').then(m => m.MarketplaceAdmin), canActivate: [permissionGuard('marketplace.manage')] },
  { path: 'admin/users', loadComponent: () => import('./Components/user-management/user-management').then(m => m.UserManagement), canActivate: [permissionGuard('users.manage')] },

  { path: '**', redirectTo: '' }
];
