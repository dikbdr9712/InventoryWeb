import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { OrderService } from '../../services/order';
import { ItemService } from '../../services/item';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { Order, OrderItem } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { orderLabel, orderPill, orderStage, paymentLabel, paymentPill } from '../../utils/order-status';
import { OrderTracker } from '../order-tracker/order-tracker';

// URL: /orders/12
@Component({
  selector: 'app-order-details',
  imports: [RouterLink, DatePipe, DecimalPipe, OrderTracker],
  templateUrl: './order-details.html',
  styleUrl: './order-details.css'
})
export class OrderDetails implements OnInit {
  private route = inject(ActivatedRoute);
  private orderService = inject(OrderService);
  private itemService = inject(ItemService);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);

  orderLabel = orderLabel;
  orderPill = orderPill;
  paymentLabel = paymentLabel;
  paymentPill = paymentPill;

  order = signal<Order | null>(null);
  items = signal<OrderItem[]>([]);
  error = signal('');
  cancelling = signal(false);

  cancelled = computed(() => orderStage(this.order()?.orderStatus) === -1);

  // The shop asked the customer for something, or refused the payment
  needsInfo = computed(() => (this.order()?.paymentStatus ?? '').toUpperCase() === 'PENDING_INFO');
  paymentRefused = computed(() => ['REJECTED', 'FAILED'].includes((this.order()?.paymentStatus ?? '').toUpperCase()));
  canCancel = computed(() => (this.order()?.orderStatus ?? '').toUpperCase() === 'PENDING');

  ngOnInit() {
    this.load();
  }

  private load() {
    const orderId = Number(this.route.snapshot.paramMap.get('id'));
    if (!orderId) {
      this.error.set('This order link is not valid.');
      return;
    }

    forkJoin({
      order: this.orderService.getById(orderId),
      items: this.orderService.getItems(orderId)
    }).subscribe({
      next: ({ order, items }) => {
        this.order.set(order);
        this.items.set(items);
      },
      error: () => this.error.set('We could not load this order. Please try again in a moment.')
    });
  }

  image(item: OrderItem) {
    return this.itemService.imageUrl(item.imagePath);
  }

  lineTotal(item: OrderItem) {
    return (item.unitPrice || 0) * (item.quantity || 0);
  }

  async cancel(order: Order) {
    const ok = await this.confirm.ask({
      title: 'Cancel this order',
      message: `Cancel order #${order.orderId}? This cannot be undone.`,
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      danger: true
    });
    if (!ok) return;

    this.cancelling.set(true);
    this.orderService.runAction(order.orderId, 'cancel').subscribe({
      next: () => {
        this.cancelling.set(false);
        this.toasts.success(`Order #${order.orderId} cancelled.`);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.cancelling.set(false);
        this.toasts.error('We could not cancel the order: ' + errorText(err));
      }
    });
  }
}
