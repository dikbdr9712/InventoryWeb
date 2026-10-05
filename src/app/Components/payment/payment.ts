import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, filter, of, switchMap } from 'rxjs';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ItemService } from '../../services/item';
import { OrderService } from '../../services/order';
import { DeliveryService } from '../../services/delivery';
import { Bank, OnlinePaymentsService, PaymentOption } from '../../services/online-payments';
import { DeliveryLocation } from '../delivery-location/delivery-location';
import { ToastService } from '../../services/toast';
import { DeliveryPoint, DeliveryQuote, DirectOrderRequest, Item, OrderItem } from '../../models/models';
import { errorText } from '../../utils/http-error';

// Checkout for both entry points:
//   /payment?orderId=12&total=450  -> pay for an order created from the cart
//   /payment?itemId=7              -> "Buy now" for a single product
@Component({
  selector: 'app-payment',
  imports: [FormsModule, DecimalPipe, RouterLink, DeliveryLocation],
  templateUrl: './payment.html',
  styleUrl: './payment.css'
})
export class Payment implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private itemService = inject(ItemService);
  private orderService = inject(OrderService);
  private delivery = inject(DeliveryService);
  private onlinePayments = inject(OnlinePaymentsService);
  private toasts = inject(ToastService);

  mode: 'order' | 'buyNow' = 'order';

  // Cart order
  orderId = 0;
  total = signal(0); // the order's real total, loaded from the server
  orderItems = signal<OrderItem[]>([]);

  // Buy now
  item = signal<Item | null>(null);
  loadError = signal('');
  quantity = signal(1);
  stock = computed(() => {
    const item = this.item();
    return item ? (this.itemService.stockOf(item) ?? 0) : 0;
  });
  price = computed(() => Number(this.item()?.sellingPrice) || 0);
  billing = { name: '', phone: '', address: '' };

  // Both
  // Online orders are paid before delivery, from the customer's own bank account through the RMA Payment Gateway
  // (the "BANK" way to pay). There is no other way: without it the order cannot be paid for now.
  onlineOptions = signal<PaymentOption[]>([]);
  optionsLoaded = signal(false);
  bankOption = computed(() => this.onlineOptions().find(o => o.code === 'BANK') ?? null);
  banks = signal<Bank[]>([]);
  deliveryFee = signal(0); // what the customer pays for delivery (cart orders: from the order; buy now: priced by the server)

  // Buy now: where to deliver, and the server's price for it (size of the product + distance from the seller)
  point = signal<DeliveryPoint | null>(null);
  quote = signal<DeliveryQuote | null>(null);

  constructor() {
    const ask = computed(() => ({ item: this.item(), quantity: this.quantity(), point: this.point() }));
    toObservable(ask).pipe(
      filter(a => this.mode === 'buyNow' && !!a.item),
      debounceTime(250),
      switchMap(a => this.delivery.quote([{ itemId: a.item!.itemId, quantity: a.quantity }], a.point).pipe(catchError(() => of(null)))),
      takeUntilDestroyed()
    ).subscribe(q => {
      this.quote.set(q);
      this.deliveryFee.set(Number(q?.totalFee) || 0);
    });
  }
  submitting = signal(false);
  submitted = signal(false); // field errors only show after the first attempt

  get amount(): number {
    return this.mode === 'order' ? this.total() : this.price() * this.quantity() + this.deliveryFee();
  }

  // Number shown on the payment step: it is step 1 when there is no delivery step
  get paymentStepNumber(): number {
    return this.mode === 'buyNow' ? 2 : 1;
  }

  ngOnInit() {
    this.onlinePayments.options().subscribe({
      next: options => {
        this.onlineOptions.set(options);
        this.optionsLoaded.set(true);
        if (this.bankOption()) {
          this.onlinePayments.banks().subscribe({ next: b => this.banks.set(b), error: () => this.banks.set([]) });
        }
      },
      error: () => {
        this.onlineOptions.set([]);
        this.optionsLoaded.set(true);
      }
    });

    const params = this.route.snapshot.queryParamMap;
    const orderId = Number(params.get('orderId'));
    const itemId = Number(params.get('itemId'));

    if (orderId) {
      // The total in the address is only shown until the server's own total arrives
      this.mode = 'order';
      this.orderId = orderId;
      this.total.set(Number(params.get('total')) || 0);
      this.orderService.getById(orderId).subscribe({
        next: order => {
          this.total.set(Number(order.totalAmount) || 0);
          this.deliveryFee.set(Number(order.deliveryFee) || 0);
        },
        error: () => {
          this.toasts.error('We could not load this order. Please start again from your cart.');
          this.router.navigate(['/cart']);
        }
      });
      this.orderService.getItems(orderId).subscribe({
        next: items => this.orderItems.set(items),
        error: () => this.orderItems.set([]) // the summary still shows the total
      });
      return;
    }

    if (itemId) {
      this.mode = 'buyNow';
      this.billing.name = this.auth.name() ?? '';
      this.itemService.getById(itemId).subscribe({
        next: item => this.item.set(item),
        error: err => {
          if (err.status === 401) {
            this.router.navigate(['/login'], { queryParams: { returnUrl: `/payment?itemId=${itemId}` } });
            return;
          }
          this.loadError.set('We could not load this product. It may have been removed.');
        }
      });
      return;
    }

    this.toasts.error('Choose a product first.');
    this.router.navigate(['/products']);
  }

  image(item: { imagePath?: string; itemName?: string }) {
    return this.itemService.imageUrl(item.imagePath);
  }

  buyNowImage(item: Item) {
    return this.itemService.imageFor(item);
  }

  lineTotal(item: OrderItem) {
    return (item.unitPrice || 0) * (item.quantity || 0);
  }

  // ---------- Quantity (buy now) ----------
  changeQty(delta: number) {
    this.setQty(this.quantity() + delta);
  }

  onQtyInput(input: HTMLInputElement) {
    this.setQty(Number(input.value));
    input.value = String(this.quantity());
  }

  private setQty(value: number) {
    this.quantity.set(Math.max(1, Math.min(Math.trunc(value) || 1, this.stock())));
  }

  // ---------- Validation ----------
  errors() {
    const e: { name?: string; phone?: string; address?: string } = {};
    if (this.mode === 'buyNow') {
      if (!this.billing.name.trim()) e.name = 'Enter the name for this order.';
      if (!/^[0-9]{8}$/.test(this.billing.phone.trim())) e.phone = 'Enter an 8-digit phone number.';
      if (!this.billing.address.trim()) e.address = 'Enter the delivery address.';
    }
    return e;
  }

  // ---------- Submit ----------
  submit() {
    if (this.submitting()) return;

    this.submitted.set(true);
    if (Object.keys(this.errors()).length > 0) {
      this.toasts.error('Please fix the highlighted fields.');
      return;
    }

    if (!this.bankOption()) {
      this.toasts.error('Online payment is not available right now. Please try again in a little while.');
      return;
    }

    if (this.mode === 'order') this.payOnline(this.orderId);
    else this.placeBuyNowOrder();
  }

  // Off to the bank payment page (/pay/bank): bank, account number, code. The result page says how it went.
  private payOnline(orderId: number) {
    this.submitting.set(true);
    this.onlinePayments.start(orderId, 'BANK').subscribe({
      next: started => this.onlinePayments.goTo(started.redirectUrl, path => this.router.navigateByUrl(path)),
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.toasts.error(err.status === 0 ? 'Could not reach the server. Is it running?' : errorText(err));
        if (this.mode === 'buyNow') {
          // the order exists already: carry on from it, so a second order is never made
          this.router.navigate(['/payment'], { queryParams: { orderId } });
        }
      }
    });
  }

  // Create the order, then pay for it
  private placeBuyNowOrder() {
    const item = this.item();
    if (!item) return;

    const quantity = this.quantity();
    if (quantity <= 0 || quantity > this.stock()) {
      this.toasts.error('That quantity is not available.');
      return;
    }

    const problem = this.quote()?.problem;
    if (problem) {
      this.toasts.error(problem);
      return;
    }

    const total = this.price() * quantity;
    const point = this.point();
    const order: DirectOrderRequest = {
      customerName: this.billing.name.trim(),
      customerEmail: this.auth.email() ?? '',
      customerPhone: this.billing.phone.trim(),
      address: this.billing.address.trim(),
      totalAmount: total,
      orderStatus: 'PENDING',
      items: [{ itemId: item.itemId, quantity, unitPrice: this.price() }],
      areaId: point?.areaId ?? null,
      dropLatitude: point?.areaId ? null : point?.latitude ?? null,
      dropLongitude: point?.areaId ? null : point?.longitude ?? null
    };

    this.submitting.set(true);

    this.orderService.create(order).subscribe({
      next: res => this.payOnline(res.orderId),
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.toasts.error('We could not place your order: ' + errorText(err));
      }
    });
  }
}
