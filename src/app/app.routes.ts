import { Routes } from '@angular/router';

// Public pages
import { Home } from './Components/home/home';
import { About } from './Components/about/about';
import { OurServices } from './Components/our-services/our-services';
import { ProductRating } from './Components/product-rating/product-rating';
import { Contact } from './Components/contact/contact';
import { Login } from './Components/login/login';
import { Signup } from './Components/signup/signup';

// Shopping
import { ProductList } from './Components/product-list/product-list';
import { ProductDetail } from './Components/product-detail/product-detail';
import { Cart } from './Components/cart/cart';
import { Payment } from './Components/payment/payment';
import { OrderSuccess } from './Components/order-success/order-success';

// Customer account
import { Profile } from './Components/profile/profile';
import { MyOrders } from './Components/my-orders/my-orders';
import { OrderDetails } from './Components/order-details/order-details';

// Staff / admin
import { ProductForm } from './Components/product-form/product-form';
import { Restock } from './Components/restock/restock';
import { Pos } from './Components/pos/pos';
import { PosHistory } from './Components/pos-history/pos-history';
import { OrderList } from './Components/order-list/order-list';
import { OrderVerification } from './Components/order-verification/order-verification';
import { ContactMessages } from './Components/contact-messages/contact-messages';
import { SalesDashboard } from './Components/sales-dashboard/sales-dashboard';
import { UserManagement } from './Components/user-management/user-management';

// Guards
import { authGuard } from './guards/auth-guard';
import { permissionGuard } from './guards/staff-guard';

export const routes: Routes = [
  // ---------- Public ----------
  { path: '', component: Home },
  { path: 'about', component: About },
  { path: 'services', component: OurServices },
  { path: 'reviews', component: ProductRating },
  { path: 'contact', component: Contact },
  { path: 'login', component: Login },
  { path: 'signup', component: Signup },

  // ---------- Products (specific paths BEFORE 'products/:id') ----------
  { path: 'products', component: ProductList },
  { path: 'products/new', component: ProductForm, canActivate: [permissionGuard('items.manage')] },
  { path: 'products/edit/:id', component: ProductForm, canActivate: [permissionGuard('items.manage')] },
  { path: 'products/:id', component: ProductDetail },

  // ---------- Shopping ----------
  { path: 'cart', component: Cart },
  { path: 'payment', component: Payment, canActivate: [authGuard] },
  { path: 'order-success', component: OrderSuccess, canActivate: [authGuard] },

  // ---------- Customer account ----------
  { path: 'profile', component: Profile, canActivate: [authGuard] },
  { path: 'orders', component: MyOrders, canActivate: [authGuard] },
  { path: 'orders/:id', component: OrderDetails, canActivate: [authGuard] },

  // ---------- Staff ----------
  { path: 'restock', component: Restock, canActivate: [permissionGuard('stock.restock')] },
  { path: 'pos', component: Pos, canActivate: [permissionGuard('pos.use')] },
  { path: 'pos-history', component: PosHistory, canActivate: [permissionGuard('pos.use')] },
  { path: 'admin/orders', component: OrderList, canActivate: [permissionGuard('orders.view')] },
  { path: 'order-verification', component: OrderVerification, canActivate: [permissionGuard('payments.verify')] },
  { path: 'admin/messages', component: ContactMessages, canActivate: [permissionGuard('messages.view')] },

  { path: 'admin/dashboard', component: SalesDashboard, canActivate: [permissionGuard('reports.view')] },

  // ---------- Admin only ----------
  { path: 'admin/users', component: UserManagement, canActivate: [permissionGuard('users.manage')] },

  { path: '**', redirectTo: '' }
];
