import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StockBatch, StockService, StockSummary, StockView } from '../../services/stock';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { errorText } from '../../utils/http-error';

type Panel = { batchId: number; kind: 'edit' | 'writeoff' | 'count' };

const SOURCE_LABELS: Record<StockBatch['source'], string> = {
  PURCHASE: 'Delivery',
  OPENING: 'Stock before batches',
  ADJUSTMENT: 'Stock count',
  RETURN: 'Returned',
  SELLER: "Seller's stock"
};

const WRITE_OFF_REASONS = ['Broken or damaged', 'Lost or missing', 'Returned to the supplier', 'Used in the shop'];

// Stock by batch: the same product bought at different prices or with different expiry dates is kept apart.
// Sales take the batch that expires first; expired batches are taken off sale by the server every night.
@Component({
  selector: 'app-stock-batches',
  imports: [FormsModule, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './stock-batches.html',
  styleUrl: './stock-batches.css'
})
export class StockBatches implements OnInit {
  private stock = inject(StockService);
  private auth = inject(AuthService);
  private toasts = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly canChange = this.auth.can('stock.restock');
  readonly reasons = WRITE_OFF_REASONS;

  view = signal<StockView>('shelf');
  days = signal(60);
  search = signal('');
  batches = signal<StockBatch[]>([]);
  summary = signal<StockSummary | null>(null);
  loading = signal(true);
  error = signal('');

  panel = signal<Panel | null>(null);
  busy = signal(false);
  form = { batchNo: '', expiryDate: '', quantity: null as number | null, reason: WRITE_OFF_REASONS[0], otherReason: '', note: '' };

  shown = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.batches();
    return this.batches().filter(b =>
      [b.itemName, b.sku, b.batchNo, b.supplier].some(v => (v ?? '').toLowerCase().includes(q)));
  });

  // how many units of each product are on the shelf (for the count form)
  private onShelf = computed(() => {
    const totals = new Map<number, number>();
    for (const b of this.batches()) if (b.status === 'ACTIVE') totals.set(b.itemId, (totals.get(b.itemId) ?? 0) + b.quantityLeft);
    return totals;
  });

  ngOnInit() {
    this.route.queryParamMap.subscribe(q => {
      const v = q.get('view');
      this.view.set(v === 'expiring' || v === 'expired' ? v : 'shelf');
      this.load();
    });
  }

  show(view: StockView) {
    this.router.navigate([], { queryParams: { view: view === 'shelf' ? null : view }, queryParamsHandling: 'merge' });
  }

  setDays(days: number) {
    this.days.set(days);
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.panel.set(null);
    this.stock.summary(this.days()).subscribe({ next: s => this.summary.set(s), error: () => {} });
    this.stock.batches(this.view(), this.days()).subscribe({
      next: list => {
        this.batches.set(list);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.status === 404 ? 'The server needs a restart to show batches.' : errorText(err));
      }
    });
  }

  // ---------- Labels ----------
  sourceLabel(b: StockBatch) {
    return SOURCE_LABELS[b.source] ?? b.source;
  }

  expiryText(b: StockBatch) {
    if (!b.expiryDate) return 'No expiry date';
    const d = b.daysLeft ?? 0;
    if (b.status === 'EXPIRED' || d < 0) return 'Expired';
    if (d === 0) return 'Expires today';
    if (d === 1) return 'Expires tomorrow';
    if (d < 60) return `Expires in ${d} days`;
    const months = Math.round(d / 30);
    return months < 24 ? `Expires in ${months} months` : `Expires in ${Math.round(d / 365)} years`;
  }

  expiryPill(b: StockBatch) {
    if (!b.expiryDate) return 'pill-mute';
    const d = b.daysLeft ?? 0;
    if (b.status === 'EXPIRED' || d < 0) return 'pill-bad';
    if (d <= 30) return 'pill-bad';
    if (d <= 90) return 'pill-wait';
    return 'pill-ok';
  }

  // ---------- Changes ----------
  open(b: StockBatch, kind: Panel['kind']) {
    const current = this.panel();
    if (current && current.batchId === b.id && current.kind === kind) {
      this.panel.set(null);
      return;
    }
    this.form = {
      batchNo: b.batchNo ?? '',
      expiryDate: b.expiryDate ?? '',
      quantity: kind === 'count' ? (this.onShelf().get(b.itemId) ?? 0) : null,
      reason: WRITE_OFF_REASONS[0],
      otherReason: '',
      note: ''
    };
    this.panel.set({ batchId: b.id, kind });
  }

  isOpen(b: StockBatch, kind: Panel['kind']) {
    const p = this.panel();
    return !!p && p.batchId === b.id && p.kind === kind;
  }

  saveDetails(b: StockBatch) {
    this.run(this.stock.change(b.id, this.form.batchNo.trim() || null, this.form.expiryDate || null), 'Batch updated.');
  }

  writeOff(b: StockBatch) {
    const qty = Math.trunc(Number(this.form.quantity));
    if (!(qty >= 1 && qty <= b.quantityLeft)) {
      this.toasts.error(`Write off between 1 and ${b.quantityLeft}.`);
      return;
    }
    const reason = this.form.reason === 'Other' ? this.form.otherReason.trim() : this.form.reason;
    if (!reason) {
      this.toasts.error('Say why, so the records explain where it went.');
      return;
    }
    this.run(this.stock.writeOff(b.id, qty, reason), `${qty} written off.`);
  }

  count(b: StockBatch) {
    const qty = Math.trunc(Number(this.form.quantity));
    if (!(qty >= 0)) {
      this.toasts.error('Enter how many are on the shelf (0 or more).');
      return;
    }
    this.run(this.stock.count(b.itemId, qty, this.form.note.trim() || null), `Stock of ${b.itemName} set to ${qty}.`);
  }

  private run(request: Observable<unknown>, done: string) {
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.toasts.success(done);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }
}
