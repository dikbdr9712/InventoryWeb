import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, of, switchMap } from 'rxjs';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { CartService } from '../../services/cart';
import { AuthService } from '../../services/auth';
import { OrderService } from '../../services/order';
import { DeliveryService } from '../../services/delivery';
import { DeliveryLocation } from '../delivery-location/delivery-location';
import { ToastService } from '../../services/toast';
import { CartItem, DeliveryPoint, DeliveryQuote, OrderRequest } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { ShopDetails } from '../../services/shop-details';

@Component({
  selector: 'app-cart',
  imports: [DecimalPipe, FormsModule, RouterLink, DeliveryLocation],
  templateUrl: './cart.html',
  styleUrl: './cart.css'
})
export class Cart {
  cart = inject(CartService);
  auth = inject(AuthService);
  private orders = inject(OrderService);
  private deliveryApi = inject(DeliveryService);
  readonly shop = inject(ShopDetails);

  // DELIVERY: a driver brings it (with a fee). PICKUP: the customer collects it where it is packed, free.
  method = signal<'DELIVERY' | 'PICKUP'>('DELIVERY');
  pickup = computed(() => this.method() === 'PICKUP');
  // where a pickup order is collected: our shop, and each seller in the cart
  pickupPlaces = computed(() => (this.quote()?.packages ?? []).map(p => ({
    name: p.sellerName,
    where: p.sellerName === 'DP DrukBazaars' || !p.town ? (p.sellerName === 'DP DrukBazaars' ? this.shop.address : '') : p.town
  })));

  // Where to deliver (the phone's location or an area). The server prices each seller's package by its size
  // and the distance from that seller; the price is asked again whenever the cart or the location changes.
  point = signal<DeliveryPoint | null>(null);
  quote = signal<DeliveryQuote | null>(null);
  quoting = signal(false);
  deliveryTotal = computed(() => this.pickup() ? 0 : Number(this.quote()?.totalFee) || 0);
  grandTotal = computed(() => this.cart.total() + this.deliveryTotal());
  estimated = computed(() => !this.pickup() && (this.quote()?.packages.some(p => p.estimated) ?? false));
  // "too far" stops a delivery, never a pickup
  problem = computed(() => this.pickup() ? null : this.quote()?.problem ?? null);

  constructor() {
    const ask = computed(() => ({ items: this.cart.items().map(i => ({ itemId: i.id, quantity: i.quantity })), point: this.point() }));
    toObservable(ask).pipe(
      debounceTime(250),
      switchMap(({ items, point }) => {
        if (items.length === 0) return of(null);
        this.quoting.set(true);
        return this.deliveryApi.quote(items, point).pipe(catchError(() => of(null)));
      }),
      takeUntilDestroyed()
    ).subscribe(q => {
      this.quote.set(q);
      this.quoting.set(false);
    });
  }
  private router = inject(Router);
  private toasts = inject(ToastService);

  placing = signal(false);
  submitted = signal(false); // field errors only show after the first attempt

  // Where the order goes. The phone is filled in from the account when we have it.
  delivery = { phone: this.auth.phone() ?? '', address: '' };

  errors() {
    const e: { phone?: string; address?: string } = {};
    if (!/^[0-9]{8}$/.test(this.delivery.phone.trim())) e.phone = 'Enter an 8-digit phone number.';
    if (!this.pickup() && !this.delivery.address.trim()) e.address = 'Enter the delivery address.';
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

    const problem = this.problem();
    if (problem) {
      this.toasts.error(problem);
      return;
    }

    const total = this.cart.total();
    const point = this.point();
    const order: OrderRequest = {
      customerEmail: email,
      customerName: name,
      customerPhone: this.delivery.phone.trim(),
      address: this.pickup() ? undefined : this.delivery.address.trim(),
      totalAmount: total,
      items: items.map(i => ({ itemId: i.id, quantity: i.quantity, price: i.price })),
      fulfilment: this.method(),
      areaId: this.pickup() ? null : point?.areaId ?? null,
      dropLatitude: this.pickup() || point?.areaId ? null : point?.latitude ?? null,
      dropLongitude: this.pickup() || point?.areaId ? null : point?.longitude ?? null
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
