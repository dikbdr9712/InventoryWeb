import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { CartService } from '../../services/cart';
import { ItemService } from '../../services/item';
import { OrderService } from '../../services/order';
import { PaymentService } from '../../services/payment';
import { ToastService } from '../../services/toast';
import { DirectOrderRequest, Item, OrderItem } from '../../models/models';
import { errorText } from '../../utils/http-error';

// Checkout for both entry points:
//   /payment?orderId=12&total=450  -> pay for an order created from the cart
//   /payment?itemId=7              -> "Buy now" for a single product
@Component({
  selector: 'app-payment',
  imports: [FormsModule, DecimalPipe, RouterLink],
  templateUrl: './payment.html',
  styleUrl: './payment.css'
})
export class Payment implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private cart = inject(CartService);
  private itemService = inject(ItemService);
  private orderService = inject(OrderService);
  private paymentService = inject(PaymentService);
  private toasts = inject(ToastService);

  mode: 'order' | 'buyNow' = 'order';

  // Cart order
  orderId = 0;
  total = 0;
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
  paymentMethod = signal<'cod' | 'bank'>('cod');
  journalNumber = '';
  submitting = signal(false);
  submitted = signal(false); // field errors only show after the first attempt

  readonly account = { name: 'Pharmith Lepcha', number: '216358950', bank: 'Bank of Bhutan' };

  get amount(): number {
    return this.mode === 'order' ? this.total : this.price() * this.quantity();
  }

  // Number shown on the payment step: it is step 1 when there is no delivery step
  get paymentStepNumber(): number {
    return this.mode === 'buyNow' ? 2 : 1;
  }

  ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const orderId = Number(params.get('orderId'));
    const itemId = Number(params.get('itemId'));

    if (orderId) {
      const total = Number(params.get('total'));
      if (!(total > 0)) {
        this.toasts.error('That order has no total. Please start again from your cart.');
        this.router.navigate(['/cart']);
        return;
      }
      this.mode = 'order';
      this.orderId = orderId;
      this.total = total;
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
    const e: { name?: string; phone?: string; address?: string; journal?: string } = {};
    if (this.mode === 'buyNow') {
      if (!this.billing.name.trim()) e.name = 'Enter the name for this order.';
      if (!/^[0-9]{8}$/.test(this.billing.phone.trim())) e.phone = 'Enter an 8-digit phone number.';
      if (!this.billing.address.trim()) e.address = 'Enter the delivery address.';
    }
    if (this.paymentMethod() === 'bank' && !this.journalNumber.trim()) {
      e.journal = 'Enter the journal number from your bank receipt.';
    }
    return e;
  }

  copy(text: string, what: string) {
    navigator.clipboard?.writeText(text).then(
      () => this.toasts.success(`${what} copied`),
      () => this.toasts.error('Could not copy. Please select and copy it by hand.')
    );
  }

  // ---------- Submit ----------
  submit() {
    if (this.submitting()) return;

    this.submitted.set(true);
    if (Object.keys(this.errors()).length > 0) {
      this.toasts.error('Please fix the highlighted fields.');
      return;
    }

    const method = this.paymentMethod();
    const journal = this.journalNumber.trim();

    if (this.mode === 'order') {
      this.payExistingOrder(method, journal);
    } else {
      this.placeBuyNowOrder(method, journal);
    }
  }

  // Record the payment, then set the order to Pending
  private payExistingOrder(method: string, journal: string) {
    this.submitting.set(true);

    this.paymentService.create({
      orderId: this.orderId,
      amount: this.total,
      paymentMethod: method,
      status: 'pending',
      journalNumber: method === 'bank' ? journal : ''
    }).subscribe({
      next: () => {
        this.orderService.updateStatus(this.orderId, 'Pending').subscribe({
          error: () => console.warn('Order status update failed, but payment was recorded.')
        });
        this.cart.clear();
        this.router.navigate(['/order-success'], { queryParams: { orderId: this.orderId } });
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.toasts.error(err.status === 0
          ? 'Could not reach the server. Is it running?'
          : 'We could not record your payment. Please try again.');
      }
    });
  }

  // Create the order, then record the payment
  private placeBuyNowOrder(method: string, journal: string) {
    const item = this.item();
    if (!item) return;

    const quantity = this.quantity();
    if (quantity <= 0 || quantity > this.stock()) {
      this.toasts.error('That quantity is not available.');
      return;
    }

    const total = this.price() * quantity;
    const order: DirectOrderRequest = {
      customerName: this.billing.name.trim(),
      customerEmail: this.auth.email() ?? '',
      customerPhone: this.billing.phone.trim(),
      address: this.billing.address.trim(),
      totalAmount: total,
      orderStatus: 'PENDING',
      items: [{ itemId: item.itemId, quantity, unitPrice: this.price() }]
    };

    this.submitting.set(true);

    this.orderService.create(order).subscribe({
      next: res => {
        this.paymentService.create({
          orderId: res.orderId,
          amount: total,
          paymentMethod: method,
          status: 'pending',
          journalNumber: method === 'bank' ? journal : null
        }).subscribe({
          next: () => this.router.navigate(['/order-success'], { queryParams: { orderId: res.orderId } }),
          error: () => {
            this.submitting.set(false);
            this.toasts.error(`Order #${res.orderId} was created, but its payment was not saved. Please contact us.`);
          }
        });
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.toasts.error('We could not place your order: ' + errorText(err));
      }
    });
  }
}
