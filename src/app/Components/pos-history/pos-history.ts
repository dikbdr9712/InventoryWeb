import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { PosService } from '../../services/pos';
import { OrderService } from '../../services/order';
import { ToastService } from '../../services/toast';
import { AuthService } from '../../services/auth';
import { ReturnDialog } from '../return-dialog/return-dialog';
import { CashDrawers } from '../cash-drawers/cash-drawers';
import { ActivatedRoute, Router } from '@angular/router';
import { ReturnService, SaleRefund } from '../../services/return';
import { Order, OrderItem, ShiftReport } from '../../models/models';
import { errorText } from '../../utils/http-error';

type Range = 'today' | 'week' | 'month' | 'all' | 'custom';

@Component({
  selector: 'app-pos-history',
  imports: [DatePipe, DecimalPipe, ReturnDialog, CashDrawers],
  templateUrl: './pos-history.html',
  styleUrl: './pos-history.css'
})
export class PosHistory implements OnInit {
  private posService = inject(PosService);
  private orderService = inject(OrderService);
  private toasts = inject(ToastService);
  private returnService = inject(ReturnService);

  // refunds already given, by sale number
  refunds = signal<Record<number, SaleRefund>>({});
  auth = inject(AuthService);

  // ---------- Sales or Cash drawers (the address keeps the choice: /pos-history?view=drawers) ----------
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  view = signal<'sales' | 'drawers'>(this.route.snapshot.queryParamMap.get('view') === 'drawers' ? 'drawers' : 'sales');

  showView(view: 'sales' | 'drawers') {
    this.router.navigate([], { queryParams: { view: view === 'drawers' ? 'drawers' : null }, queryParamsHandling: 'merge' });
  }

  // the sale whose Return window is open
  returnOrderId = signal<number | null>(null);

  ranges: { value: Range; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: 'all', label: 'All time' },
    { value: 'custom', label: 'Custom range' }
  ];

  sales = signal<Order[]>([]);
  loading = signal(true);
  error = signal('');

  range = signal<Range>('today');
  customFrom = signal(''); // yyyy-mm-dd from the date boxes
  customTo = signal('');
  searchTerm = signal('');

  // Sale details open under their row
  openOrderId = signal<number | null>(null);
  itemsByOrder = signal<Record<number, OrderItem[]>>({});

  // Sales in the chosen period that match the search, newest first
  visible = computed(() => {
    const { from, to } = this.bounds();
    const term = this.searchTerm().toLowerCase().trim();

    return this.sales()
      .filter(sale => {
        if (from || to) {
          if (!sale.createdAt) return false;
          const when = new Date(sale.createdAt);
          if (from && when < from) return false;
          if (to && when > to) return false;
        }
        if (!term) return true;
        return String(sale.orderId).includes(term) || (sale.customerName || 'walk-in').toLowerCase().includes(term);
      })
      .sort((a, b) => (b.orderId || 0) - (a.orderId || 0));
  });

  // A start date that comes after the end date can never match anything
  dateError = computed(() => {
    if (this.range() !== 'custom') return '';
    const from = this.parseDay(this.customFrom(), false);
    const to = this.parseDay(this.customTo(), true);
    return from && to && from > to ? 'The start date is after the end date.' : '';
  });

  summary = computed(() => {
    const list = this.visible();
    const gross = list.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    const refunded = list.reduce((sum, s) => sum + (this.refunds()[s.orderId]?.refundedAmount ?? 0), 0);
    const total = Math.round((gross - refunded) * 100) / 100; // net sales
    return { count: list.length, gross, refunded, total, average: list.length ? total / list.length : 0 };
  });

  private loadRefunds() {
    this.returnService.summary().subscribe({
      next: rows => {
        const bySale: Record<number, SaleRefund> = {};
        for (const row of rows) bySale[row.orderId] = row;
        this.refunds.set(bySale);
      },
      error: () => { /* the list still works without the tags */ }
    });
  }

  refundOf(orderId: number): SaleRefund | undefined {
    return this.refunds()[orderId];
  }

  isFullyReturned(orderId: number): boolean {
    return this.refunds()[orderId]?.fullyReturned === true;
  }

  onReturned() {
    this.toasts.success('Return recorded.');
    this.loadRefunds(); // the tag and the totals update straight away
  }

  ngOnInit() {
    this.route.queryParamMap.subscribe(q => this.view.set(q.get('view') === 'drawers' ? 'drawers' : 'sales'));
    this.loadRefunds();
    this.posService.history().subscribe({
      next: sales => {
        this.sales.set(sales);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set('We could not load the sales: ' + errorText(err));
        this.loading.set(false);
      }
    });
  }

  // Start of the chosen period in the shop's local time, or null for "all time"
  private startOf(range: Range): Date | null {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (range) {
      case 'today': return today;
      case 'week': {
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // weeks start on Monday
        return monday;
      }
      case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
      default: return null;
    }
  }

  // The period as a start and an end (either can be empty = no limit)
  private bounds(): { from: Date | null; to: Date | null } {
    if (this.range() === 'custom') {
      return { from: this.parseDay(this.customFrom(), false), to: this.parseDay(this.customTo(), true) };
    }
    return { from: this.startOf(this.range()), to: null };
  }

  // "2026-09-29" as a date in the shop's local time (start or very end of that day)
  private parseDay(value: string, endOfDay: boolean): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
    return endOfDay ? new Date(year, month, day, 23, 59, 59, 999) : new Date(year, month, day);
  }

  rangeLabel(): string {
    if (this.range() === 'custom') {
      const from = this.parseDay(this.customFrom(), false);
      const to = this.parseDay(this.customTo(), true);
      const show = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      if (from && to) return `from ${show(from)} to ${show(to)}`;
      if (from) return `since ${show(from)}`;
      if (to) return `up to ${show(to)}`;
      return 'in the chosen dates';
    }
    return this.ranges.find(r => r.value === this.range())?.label.toLowerCase() ?? '';
  }

  paymentLabel(method?: string): string {
    switch ((method ?? '').toUpperCase()) {
      case 'CASH': return 'Cash';
      case 'CARD': return 'Card';
      case 'UPI': return 'UPI';
      case 'BANK_TRANSFER': return 'Bank transfer';
      default: return method ?? '';
    }
  }

  lineTotal(item: OrderItem) {
    return (item.unitPrice || 0) * (item.quantity || 0);
  }

  toggle(orderId: number) {
    if (this.openOrderId() === orderId) {
      this.openOrderId.set(null);
      return;
    }
    this.openOrderId.set(orderId);

    if (this.itemsByOrder()[orderId]) return; // already loaded
    this.orderService.getItems(orderId).subscribe({
      next: items => this.itemsByOrder.update(all => ({ ...all, [orderId]: items })),
      error: (err: HttpErrorResponse) => this.toasts.error('We could not load the items: ' + errorText(err))
    });
  }
}
