import { AfterViewInit, Component, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ItemService } from '../../services/item';
import { ReturnService, ReturnableLine, ReturnableOrder, ReturnView } from '../../services/return';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { errorText } from '../../utils/http-error';
import { focusFirstError } from '../../utils/focus-error';
import { clampQuantity, itemCount, itemsToSend, lineRefund, refundTotal } from '../../utils/return-math';
import { printElement } from '../../utils/print-area';
import { SHOP } from '../../utils/shop-info';

const REASONS = [
  { value: 'CHANGED_MIND', label: 'The customer changed their mind' },
  { value: 'DAMAGED', label: 'Damaged or faulty' },
  { value: 'WRONG_ITEM', label: 'The wrong item was sold' },
  { value: 'OTHER', label: 'Another reason' }
];

// Opened from Sales history:  <app-return-dialog [orderId]="11" (closed)="..." (returned)="..." />
@Component({
  selector: 'app-return-dialog',
  imports: [DecimalPipe, DatePipe],
  templateUrl: './return-dialog.html',
  styleUrl: './return-dialog.css'
})
export class ReturnDialog implements OnInit, AfterViewInit {
  orderId = input.required<number>();
  closed = output<void>();
  returned = output<ReturnView>();

  private returnService = inject(ReturnService);
  private itemService = inject(ItemService);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);
  private host = inject(ElementRef);
  private dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private creditNote = viewChild<ElementRef<HTMLElement>>('creditNote');
  private creditReceipt = viewChild<ElementRef<HTMLElement>>('creditReceipt');

  shop = SHOP;
  reasons = REASONS;

  loading = signal(true);
  loadError = signal('');
  data = signal<ReturnableOrder | null>(null);
  products = signal<Record<number, { name: string; image: string }>>({});

  // What the staff member chooses
  qty = signal<Record<number, number>>({});      // orderItemId -> how many to take back
  restock = signal<Record<number, boolean>>({}); // orderItemId -> put back on the shelf?
  private restockTouched = new Set<number>();   // lines where the person chose for themselves
  reason = signal('');
  refundMethod = signal<'CASH' | 'ORIGINAL'>('CASH');
  note = signal('');

  saving = signal(false);
  submitted = signal(false);
  done = signal<ReturnView | null>(null);

  lines = computed(() => this.data()?.lines ?? []);
  total = computed(() => refundTotal(this.lines(), this.qty()));
  count = computed(() => itemCount(this.lines(), this.qty()));
  nothingLeft = computed(() => this.lines().length > 0 && this.lines().every(l => l.quantityLeft === 0));
  showForm = computed(() => !!this.data()?.eligible && !this.nothingLeft());

  ngOnInit() {
    // item names and photos, so the lines are not just numbers
    this.itemService.getAll().subscribe({
      next: items => {
        const known: Record<number, { name: string; image: string }> = {};
        for (const item of items) {
          known[item.itemId] = { name: item.itemName, image: this.itemService.imageFor(item) };
        }
        this.products.set(known);
      },
      error: () => { /* the lines still work, they just show "Item #1" */ }
    });

    this.returnService.returnable(this.orderId()).subscribe({
      next: data => {
        this.data.set(data);
        const stock: Record<number, boolean> = {};
        for (const line of data.lines) stock[line.orderItemId] = true;
        this.restock.set(stock);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(
          err.status === 401 ? 'Please sign in again.'
            : err.status === 403 ? 'Your account is not allowed to see returns.'
              : errorText(err)
        );
      }
    });
  }

  ngAfterViewInit() {
    // keyboard focus goes to the dialog itself, so a stray Enter cannot press a button
    setTimeout(() => this.dialog()?.nativeElement.focus(), 0);
  }

  // ---------- what the lines show ----------
  nameOf(line: { itemId: number }) {
    return this.products()[line.itemId]?.name ?? `Item #${line.itemId}`;
  }

  imageOf(line: { itemId: number }) {
    return this.products()[line.itemId]?.image ?? 'Images/default.jpg';
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }

  reasonLabel(value: string) {
    return REASONS.find(r => r.value === value)?.label ?? value;
  }

  quantityOf(line: ReturnableLine) {
    return this.qty()[line.orderItemId] ?? 0;
  }

  lineTotal(line: ReturnableLine) {
    return lineRefund(line.unitRefund, this.quantityOf(line));
  }

  restockedCount(view: ReturnView) {
    return view.items.filter(i => i.restocked).reduce((sum, i) => sum + i.quantity, 0);
  }

  // ---------- what the staff member does ----------
  change(line: ReturnableLine, delta: number) {
    const next = clampQuantity(this.quantityOf(line) + delta, line.quantityLeft);
    this.qty.update(q => ({ ...q, [line.orderItemId]: next }));
  }

  returnEverything() {
    const all: Record<number, number> = {};
    for (const line of this.lines()) all[line.orderItemId] = line.quantityLeft;
    this.qty.set(all);
  }

  toggleRestock(line: ReturnableLine) {
    this.restockTouched.add(line.orderItemId);
    this.restock.update(r => ({ ...r, [line.orderItemId]: !(r[line.orderItemId] ?? true) }));
  }

  // "Damaged" means the items are not put back in stock, unless the person chose differently for a line
  setReason(value: string) {
    this.reason.set(value);
    const putBack = value !== 'DAMAGED';
    this.restock.update(r => {
      const next = { ...r };
      for (const line of this.lines()) {
        if (!this.restockTouched.has(line.orderItemId)) next[line.orderItemId] = putBack;
      }
      return next;
    });
  }

  errors() {
    const e: { reason?: string; items?: string } = {};
    if (!this.reason()) e.reason = 'Choose why the items are coming back.';
    if (this.count() === 0) e.items = 'Choose at least one item to take back.';
    return e;
  }

  async submit() {
    if (this.saving()) return;

    this.submitted.set(true);
    if (Object.keys(this.errors()).length > 0) {
      focusFirstError(this.host.nativeElement);
      return;
    }

    const total = this.total();
    const count = this.count();
    const method = this.refundMethod();
    const ok = await this.confirm.ask({
      title: 'Give the money back',
      message: `Refund Nu. ${this.money(total)} ${method === 'CASH' ? 'in cash' : 'to the original payment method'} `
        + `for ${count} ${count === 1 ? 'item' : 'items'} from sale #${this.orderId()}? This cannot be undone.`,
      confirmLabel: `Refund Nu. ${this.money(total)}`,
      danger: true
    });
    if (!ok) return;

    this.saving.set(true);
    this.returnService.create(this.orderId(), {
      reason: this.reason(),
      note: this.note().trim(),
      refundMethod: method,
      items: itemsToSend(this.lines(), this.qty(), this.restock())
    }).subscribe({
      next: view => {
        this.saving.set(false);
        this.done.set(view);
        this.returned.emit(view);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  print(kind: 'receipt' | 'a4') {
    const source = (kind === 'receipt' ? this.creditReceipt() : this.creditNote())?.nativeElement;
    if (!source) {
      this.toasts.error('The credit note is not ready yet.');
      return;
    }
    printElement(source, kind);
  }

  close() {
    if (!this.saving()) this.closed.emit();
  }

  private money(amount: number) {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
