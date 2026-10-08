import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { OrderService } from '../../services/order';
import { MarketplaceService } from '../../services/marketplace';
import { ItemService } from '../../services/item';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { Order, OrderItem, OrderPackage } from '../../models/models';
import { mapLink, packageLabel, packagePill, packageStage } from '../../utils/package-status';
import { ShopDetails } from '../../services/shop-details';
import { errorText } from '../../utils/http-error';
import { orderLabel, orderPill, orderStage, paymentLabel, paymentPill } from '../../utils/order-status';
import { OrderTracker } from '../order-tracker/order-tracker';
import { OrderRatingPanel } from '../order-rating/order-rating';
import { ReturnRequestPanel } from '../return-request/return-request';
import { CartService } from '../../services/cart';

// URL: /orders/12
@Component({
  selector: 'app-order-details',
  imports: [RouterLink, DatePipe, DecimalPipe, OrderTracker, OrderRatingPanel, ReturnRequestPanel],
  templateUrl: './order-details.html',
  styleUrl: './order-details.css'
})
export class OrderDetails implements OnInit {
  private route = inject(ActivatedRoute);
  private orderService = inject(OrderService);
  private marketplace = inject(MarketplaceService);
  private itemService = inject(ItemService);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);
  private cart = inject(CartService);
  private router = inject(Router);
  buyingAgain = signal(false);

  // "Buy again": this order's products into the cart, at today's prices (the ones still sold and in stock)
  buyAgain() {
    this.buyingAgain.set(true);
    this.itemService.catalog().subscribe({
      next: list => {
        this.buyingAgain.set(false);
        const byId = new Map(list.map(i => [i.itemId, i]));
        let added = 0, missing = 0;
        for (const line of this.items()) {
          const item = line.itemId != null ? byId.get(line.itemId) : undefined;
          const stock = item ? this.itemService.stockOf(item) : null;
          if (!item || !this.itemService.forSale(item) || (stock !== null && stock <= 0)) { missing++; continue; }
          this.cart.add({
            id: item.itemId, name: item.itemName, price: Number(item.sellingPrice) || 0, image: this.itemService.imageFor(item),
            sellerId: item.sellerId ?? null, sellerName: item.sellerName
          }, Math.min(line.quantity ?? 1, stock ?? 99));
          added++;
        }
        if (!added) {
          this.toasts.error('None of these products can be bought right now (sold out or no longer sold).');
          return;
        }
        this.toasts.success(missing
          ? `Added ${added} to your cart. ${missing} cannot be bought right now.`
          : "Added to your cart at today's prices.");
        this.router.navigate(['/cart']);
      },
      error: () => {
        this.buyingAgain.set(false);
        this.toasts.error('We could not load the products. Please try again.');
      }
    });
  }

  orderLabel = orderLabel;
  orderPill = orderPill;
  paymentLabel = paymentLabel;
  paymentPill = paymentPill;
  packageLabel = packageLabel;
  packagePill = packagePill;
  packageStage = packageStage;
  readonly steps = ['Packed', 'Picked up', 'Delivered'];
  readonly pickupSteps = ['Packed', 'Collected']; // "Pick up myself"
  readonly shop = inject(ShopDetails);
  readonly mapLink = mapLink;

  isPickup = computed(() => this.order()?.fulfilment === 'PICKUP');

  // a step of a package's progress is done: Packed (1), Picked up (2), Delivered or Collected (3)
  stepDone(p: { status: string; selfPickup?: boolean }, index: number) {
    const stage = packageStage(p.status);
    return p.selfPickup ? stage >= (index === 0 ? 1 : 3) : stage >= index + 1;
  }

  order = signal<Order | null>(null);
  items = signal<OrderItem[]>([]);
  packages = signal<OrderPackage[]>([]); // one per seller (orders placed since the marketplace)
  error = signal('');
  cancelling = signal(false);

  cancelled = computed(() => orderStage(this.order()?.orderStatus) === -1);

  // The shop asked the customer for something, or refused the payment
  needsInfo = computed(() => (this.order()?.paymentStatus ?? '').toUpperCase() === 'PENDING_INFO');
  paymentRefused = computed(() => ['REJECTED', 'FAILED'].includes((this.order()?.paymentStatus ?? '').toUpperCase()));
  // Same rule as the server: the customer may cancel until the shop starts working on it
  canCancel = computed(() => ['CREATED', 'PENDING'].includes((this.order()?.orderStatus ?? '').toUpperCase()));
  itemsTotal = computed(() => this.items().reduce((sum, i) => sum + this.lineTotal(i), 0));

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
        this.marketplace.orderPackages(orderId).subscribe({ next: list => this.packages.set(list), error: () => {} });
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
