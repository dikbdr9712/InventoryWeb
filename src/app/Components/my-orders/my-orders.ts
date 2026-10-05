import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth';
import { OrderService } from '../../services/order';
import { ItemService } from '../../services/item';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { Order, OrderItem } from '../../models/models';
import { errorText } from '../../utils/http-error';

type OrderWithItems = Order & { items: OrderItem[] };

@Component({
  selector: 'app-my-orders',
  imports: [RouterLink, DatePipe, DecimalPipe],
  templateUrl: './my-orders.html',
  styleUrl: './my-orders.css'
})
export class MyOrders implements OnInit {
  private auth = inject(AuthService);
  private orderService = inject(OrderService);
  private itemService = inject(ItemService);
  private dialog = inject(ConfirmService);
  private toasts = inject(ToastService);

  // The stages of a normal order, in the order they happen
  steps = ['Placed', 'Confirmed', 'Shipped', 'Delivered'];

  orders = signal<OrderWithItems[]>([]);
  loading = signal(true);
  error = signal('');
  sortOrder = signal<'asc' | 'desc'>('desc');

  sorted = computed(() =>
    [...this.orders()].sort((a, b) =>
      this.sortOrder() === 'asc' ? a.orderId - b.orderId : b.orderId - a.orderId
    )
  );

  ngOnInit() {
    this.load();
  }

  load() {
    const email = this.auth.email();
    if (!email) return; // authGuard already sends logged-out users to /login

    this.loading.set(true);
    this.orderService.getByCustomer(email).pipe(
      switchMap(orders => orders.length === 0
        ? of([] as OrderWithItems[])
        : forkJoin(orders.map(order =>
            this.orderService.getItems(order.orderId).pipe(
              map(items => ({ ...order, items })),
              catchError(() => of({ ...order, items: [] as OrderItem[] }))
            )
          ))
      )
    ).subscribe({
      next: list => {
        this.orders.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('We could not load your orders. Please try again in a moment.');
        this.loading.set(false);
      }
    });
  }

  image(item: OrderItem) {
    return this.itemService.imageUrl(item.imagePath);
  }

  lineTotal(item: OrderItem) {
    return (item.unitPrice || 0) * (item.quantity || 0);
  }

  // How far the order has got: 0 = placed ... 3 = delivered, -1 = cancelled
  stage(status?: string): number {
    switch ((status ?? '').toUpperCase()) {
      case 'CONFIRMED': return 1;
      case 'SHIPPED': return 2;
      case 'COMPLETED': return 3;
      case 'CANCELLED': return -1;
      default: return 0; // CREATED, PENDING
    }
  }

  statusLabel(status?: string): string {
    switch ((status ?? '').toUpperCase()) {
      case 'CREATED': return 'Placed';
      case 'PENDING': return 'Awaiting payment';
      case 'CONFIRMED': return 'Confirmed';
      case 'SHIPPED': return 'On its way';
      case 'COMPLETED': return 'Delivered';
      case 'CANCELLED': return 'Cancelled';
      default: return status ?? 'Unknown';
    }
  }

  pillClass(status?: string): string {
    switch (this.stage(status)) {
      case -1: return 'pill-bad';
      case 3: return 'pill-ok';
      case 2:
      case 1: return 'pill-info';
      default: return 'pill-wait';
    }
  }

  async cancelOrder(order: Order) {
    const ok = await this.dialog.ask({
      title: 'Cancel order #' + order.orderId + '?',
      message: 'If you have already paid, we will contact you about the refund.',
      confirmLabel: 'Cancel the order',
      danger: true
    });
    if (!ok) return;

    this.orderService.runAction(order.orderId, 'cancel').subscribe({
      next: () => {
        this.toasts.success('Order #' + order.orderId + ' was cancelled.');
        this.load();
      },
      error: err => this.toasts.error(err.status === 0
        ? 'Could not reach the server. Please try again.'
        : 'We could not cancel the order: ' + errorText(err))
    });
  }
}
