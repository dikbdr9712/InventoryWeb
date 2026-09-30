import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { CartService } from '../../services/cart';
import { AuthService } from '../../services/auth';
import { OrderService } from '../../services/order';
import { ToastService } from '../../services/toast';
import { CartItem, OrderRequest } from '../../models/models';
import { errorText } from '../../utils/http-error';

@Component({
  selector: 'app-cart',
  imports: [DecimalPipe, FormsModule, RouterLink],
  templateUrl: './cart.html',
  styleUrl: './cart.css'
})
export class Cart {
  cart = inject(CartService);
  auth = inject(AuthService);
  private orders = inject(OrderService);
  private router = inject(Router);
  private toasts = inject(ToastService);

  placing = signal(false);
  submitted = signal(false); // field errors only show after the first attempt

  // Where the order goes. The phone is filled in from the account when we have it.
  delivery = { phone: this.auth.phone() ?? '', address: '' };

  errors() {
    const e: { phone?: string; address?: string } = {};
    if (!/^[0-9]{8}$/.test(this.delivery.phone.trim())) e.phone = 'Enter an 8-digit phone number.';
    if (!this.delivery.address.trim()) e.address = 'Enter the delivery address.';
    return e;
  }

  change(item: CartItem, delta: number) {
    this.cart.setQuantity(item.id, item.quantity + delta);
  }

  onQuantityInput(item: CartItem, input: HTMLInputElement) {
    const qty = parseInt(input.value, 10);
    if (!isNaN(qty) && qty > 0) this.cart.setQuantity(item.id, qty);
    input.value = String(this.cart.items().find(i => i.id === item.id)?.quantity ?? item.quantity);
  }

  remove(item: CartItem) {
    this.cart.setQuantity(item.id, 0);
    this.toasts.info(`${item.name} removed from your cart.`);
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }

  placeOrder() {
    if (this.placing()) return;

    if (!this.auth.isLoggedIn()) {
      this.toasts.info('Please sign in to place your order. Your cart will be waiting.');
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/cart' } });
      return;
    }

    this.submitted.set(true);
    if (Object.keys(this.errors()).length > 0) {
      this.toasts.error('Please fix the highlighted fields.');
      return;
    }

    const email = this.auth.email();
    const name = this.auth.name();
    if (!email || !name) {
      this.toasts.error('Your account details are incomplete. Please sign in again.');
      return;
    }

    const items = this.cart.items();
    if (items.length === 0) return;

    const total = this.cart.total();
    const order: OrderRequest = {
      customerEmail: email,
      customerName: name,
      customerPhone: this.delivery.phone.trim(),
      address: this.delivery.address.trim(),
      totalAmount: total,
      items: items.map(i => ({ itemId: i.id, quantity: i.quantity, price: i.price }))
    };

    this.placing.set(true);
    this.orders.create(order).subscribe({
      next: res => this.router.navigate(['/payment'], { queryParams: { orderId: res.orderId, total } }),
      error: (err: HttpErrorResponse) => {
        this.placing.set(false);
        this.toasts.error(err.status === 0
          ? 'Could not reach the server. Is it running?'
          : 'We could not create your order: ' + errorText(err));
      }
    });
  }
}
