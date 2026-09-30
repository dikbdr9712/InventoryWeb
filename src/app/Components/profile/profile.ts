import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { CartService } from '../../services/cart';
import { OrderService } from '../../services/order';
import { ToastService } from '../../services/toast';
import { Order } from '../../models/models';
import { PERMISSION_LABELS, permissionsFor } from '../../utils/permissions';
import { orderLabel, orderPill } from '../../utils/order-status';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  CONTROLLER: 'Controller',
  USER: 'Customer'
};

@Component({
  selector: 'app-profile',
  imports: [RouterLink],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {
  private auth = inject(AuthService);
  private cart = inject(CartService);
  private router = inject(Router);
  private orderService = inject(OrderService);
  private toasts = inject(ToastService);

  orderLabel = orderLabel;
  orderPill = orderPill;

  name = this.auth.name() || 'Your account';
  email = this.auth.email() || '';
  phone = this.auth.phone() || '';

  roleName = (this.auth.role() ?? 'USER').toUpperCase();
  roleLabel = ROLE_LABELS[this.roleName] ?? this.roleName;

  // What this account may do, in plain words (customers have no staff tools)
  abilities = permissionsFor(this.roleName).map(p => PERMISSION_LABELS[p]);

  orders = signal<Order[]>([]);
  ordersLoaded = signal(false);
  latest = computed(() => [...this.orders()].sort((a, b) => b.orderId - a.orderId)[0] ?? null);

  initials = (() => {
    const parts = this.name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  })();

  ngOnInit() {
    if (!this.email) return;
    this.orderService.getByCustomer(this.email).subscribe({
      next: orders => {
        this.orders.set(orders);
        this.ordersLoaded.set(true);
      },
      error: () => this.ordersLoaded.set(true) // the page still works without the order summary
    });
  }

  signOut() {
    this.auth.logout();
    this.cart.clear(); // the next person at a shared computer starts with an empty cart
    this.toasts.info('You have been signed out.');
    this.router.navigate(['/']);
  }
}
