import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { errorText } from '../../utils/http-error';
import { AuthService } from '../../services/auth';
import { CartService } from '../../services/cart';
import { OrderService } from '../../services/order';
import { ToastService } from '../../services/toast';
import { Order } from '../../models/models';
import { PERMISSION_LABELS, permissionsFor } from '../../utils/permissions';
import { orderLabel, orderPill } from '../../utils/order-status';
import { MyAddresses } from '../my-addresses/my-addresses';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  CONTROLLER: 'Controller',
  USER: 'Customer',
  SELLER: 'Seller',
  RIDER: 'Delivery driver'
};

@Component({
  selector: 'app-profile',
  imports: [RouterLink, FormsModule, MyAddresses],
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
  abilities = ((this.auth.permissions() ?? permissionsFor(this.roleName)) as (keyof typeof PERMISSION_LABELS)[])
    .map(p => PERMISSION_LABELS[p])
    .filter(Boolean);

  orders = signal<Order[]>([]);
  ordersLoaded = signal(false);
  latest = computed(() => [...this.orders()].sort((a, b) => b.orderId - a.orderId)[0] ?? null);

  initials = (() => {
    const parts = this.name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  })();

  // Change password
  pw = { current: '', next: '', confirm: '' };
  pwSubmitted = signal(false);
  pwSaving = signal(false);
  pwError = signal('');

  pwErrors() {
    const e: { current?: string; next?: string; confirm?: string } = {};
    if (!this.pw.current) e.current = 'Enter your current password.';
    if (this.pw.next.length < 6) e.next = 'Use at least 6 characters.';
    else if (this.pw.next === this.pw.current) e.next = 'Choose a password different from the current one.';
    if (this.pw.confirm !== this.pw.next) e.confirm = 'The passwords do not match.';
    return e;
  }

  changePassword() {
    if (this.pwSaving()) return;
    this.pwError.set('');
    this.pwSubmitted.set(true);
    if (Object.keys(this.pwErrors()).length > 0) return;

    this.pwSaving.set(true);
    this.auth.changePassword(this.pw.current, this.pw.next).subscribe({
      next: () => {
        this.pwSaving.set(false);
        this.pwSubmitted.set(false);
        this.pw = { current: '', next: '', confirm: '' };
        this.toasts.success('Your password has been changed.');
      },
      error: (err: HttpErrorResponse) => {
        this.pwSaving.set(false);
        this.pwError.set(errorText(err));
      }
    });
  }

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
