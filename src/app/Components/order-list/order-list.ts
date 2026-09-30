import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { OrderService } from '../../services/order';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { AuthService } from '../../services/auth';
import { AdminOrder, AdminOrderItem, OrderAction } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { orderLabel, orderPill, paymentLabel, paymentPill } from '../../utils/order-status';

@Component({
  selector: 'app-order-list',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './order-list.html',
  styleUrl: './order-list.css'
})
export class OrderList implements OnInit {
  private orderService = inject(OrderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);
  auth = inject(AuthService);

  // used by the template
  orderLabel = orderLabel;
  orderPill = orderPill;
  paymentLabel = paymentLabel;
  paymentPill = paymentPill;

  orders = signal<AdminOrder[]>([]);
  loading = signal(true);
  error = signal('');
  busyId = signal<number | null>(null); // the order an action is running on

  view = signal<'needs-action' | 'all'>('needs-action');
  statusFilter = signal('');
  searchTerm = signal('');
  sortOrder = signal<'asc' | 'desc'>('desc');

  statusOptions = [
    { label: 'Any status', value: '' },
    { label: 'Placed', value: 'CREATED' },
    { label: 'Awaiting payment', value: 'PENDING' },
    { label: 'Confirmed', value: 'CONFIRMED' },
    { label: 'On its way', value: 'SHIPPED' },
    { label: 'Delivered', value: 'COMPLETED' },
    { label: 'Cancelled', value: 'CANCELLED' }
  ];

  needsActionCount = computed(() => this.orders().filter(o => this.needsAction(o)).length);

  filtered = computed(() => {
    let list = [...this.orders()];

    if (this.view() === 'needs-action') list = list.filter(o => this.needsAction(o));

    const status = this.statusFilter();
    if (status) list = list.filter(o => o.orderStatus === status);

    const term = this.searchTerm().toLowerCase().trim();
    if (term) {
      list = list.filter(o =>
        String(o.orderId).includes(term) ||
        (o.customerName || '').toLowerCase().includes(term) ||
        (o.customerEmail || '').toLowerCase().includes(term)
      );
    }

    return list.sort((a, b) =>
      this.sortOrder() === 'asc' ? (a.orderId || 0) - (b.orderId || 0) : (b.orderId || 0) - (a.orderId || 0)
    );
  });

  ngOnInit() {
    // Arriving from a customer message ("Open order #6"): show that order straight away
    const q = this.route.snapshot.queryParamMap.get('q');
    if (q) {
      this.searchTerm.set(q);
      this.view.set('all'); // the order may not be in "Needs action"
    }
    this.load();
  }

  load() {
    this.orderService.getAllForAdmin().subscribe({
      next: orders => {
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status === 403) {
          this.toasts.error('Only staff accounts can view orders.');
          this.router.navigate(['/login']);
          return;
        }
        this.error.set('We could not load the orders. Please try again in a moment.');
      }
    });
  }

  // Same rules as before: which orders wait for a person to do something
  needsAction(order: AdminOrder): boolean {
    const status = order.orderStatus;
    const payment = order.paymentStatus;
    if ((payment === 'PAID' || payment === 'PARTIALLY_PAID') && status === 'CREATED') return true;
    if (status === 'CONFIRMED') return true;
    if (status === 'SHIPPED') return true;
    if (!status || status === 'UNKNOWN') return true;
    return false;
  }

  allInStock(order: AdminOrder): boolean {
    return (order.items || []).every(i => (i.stockAvailable ?? 0) >= (i.quantityOrdered ?? 0));
  }

  short(item: AdminOrderItem): boolean {
    return (item.stockAvailable ?? 0) < (item.quantityOrdered ?? 0);
  }

  lineTotal(item: AdminOrderItem) {
    return (item.unitPrice || 0) * (item.quantityOrdered || 0);
  }

  // ---------- Actions (each one asks first) ----------
  async confirmPayment(order: AdminOrder) {
    const ok = await this.confirm.ask({
      title: 'Confirm payment',
      message: `Confirm that the payment for order #${order.orderId} was received?`,
      confirmLabel: 'Payment received'
    });
    if (ok) this.run(order, 'confirm-payment', 'Payment confirmed.');
  }

  async confirmOrder(order: AdminOrder) {
    const ok = await this.confirm.ask({
      title: 'Confirm order',
      message: `Confirm order #${order.orderId}? The stock for its items will be deducted.`,
      confirmLabel: 'Confirm order'
    });
    if (ok) this.run(order, 'confirm', `Order #${order.orderId} confirmed.`);
  }

  async shipOrder(order: AdminOrder) {
    const ok = await this.confirm.ask({
      title: 'Ship order',
      message: `Mark order #${order.orderId} as shipped? A shipment record is created automatically.`,
      confirmLabel: 'Mark as shipped'
    });
    if (ok) this.run(order, 'ship', `Order #${order.orderId} marked as shipped.`);
  }

  async completeOrder(order: AdminOrder) {
    const ok = await this.confirm.ask({
      title: 'Mark as delivered',
      message: `Mark order #${order.orderId} as delivered and completed?`,
      confirmLabel: 'Mark delivered'
    });
    if (ok) this.run(order, 'complete', `Order #${order.orderId} completed.`);
  }

  async cancelOrder(order: AdminOrder) {
    const ok = await this.confirm.ask({
      title: 'Cancel order',
      message: `Cancel order #${order.orderId}? The customer will see it as cancelled.`,
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      danger: true
    });
    if (ok) this.run(order, 'cancel', `Order #${order.orderId} cancelled.`);
  }

  private run(order: AdminOrder, action: OrderAction, done: string) {
    this.busyId.set(order.orderId);
    this.orderService.runAction(order.orderId, action).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toasts.success(done);
        this.load(); // show the new status
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        if (err.status === 401 || err.status === 403) {
          this.toasts.error('Your session has ended. Please sign in again.');
          this.router.navigate(['/login'], { queryParams: { returnUrl: '/admin/orders' } });
          return;
        }
        this.toasts.error(`That did not work: ${errorText(err)}`);
      }
    });
  }
}
