import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ItemService } from '../../services/item';
import { PosService } from '../../services/pos';
import { AuthService } from '../../services/auth';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { CustomerLookup, CustomerService } from '../../services/customer';
import { PosSaleRequest, PosTax, ShiftReport } from '../../models/models';
import { errorText } from '../../utils/http-error';

interface PosProduct {
  itemId: number;
  itemName: string;
  itemCode: string;
  category: string;
  image: string;
  mrp: number;
  sellingPrice: number;
  stock: number | null; // null = the API did not send a stock number
}

interface PosLine {
  itemId: number;
  itemName: string;
  mrp: number;
  discountPercent: number;
  quantity: number;
  stock: number | null;
}

interface Invoice {
  orderId?: number;
  date: Date;
  cashier: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string;
  cashReceived: number | null; // cash sales only
  change: number | null;       // cash sales only: what to give back
  lines: { name: string; qty: number; mrp: number; discountPercent: number; total: number }[];
  subtotal: number;
  discount: number;
  taxLines: { label: string; amount: number }[];
  total: number;
}

// A sale in progress, kept in this browser so a refresh, a crash or a held sale never loses it
interface SaleDraft {
  cart: PosLine[];
  customerName: string;
  customerPhone: string;
  taxes: PosTax[];
  paymentMethod: string;
  saleDiscountMode: 'percent' | 'amount';
  saleDiscountValue: number | null;
}

interface HeldSale {
  id: string;
  at: string;
  label: string;
  total: number;
  draft: SaleDraft;
}

const DRAFT_KEY = 'posDraft';
const HELD_KEY = 'posHeld';
const MAX_HELD = 10;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the sale still works */
  }
}

function newRef(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Printed at the top of every invoice and receipt
const SHOP = {
  name: 'DK/Phar Inventory Management System',
  address: 'Thimphu, Bhutan',
  phone: '77269712',
  email: 'dikbdrghalley12@gmail.com'
};


// Turns whatever was typed or pasted into at most 8 digits.
// A leading Bhutan country code (975 or 00975) is dropped, so "+975 77 26 97 12" becomes 77269712.
function cleanPhone(raw: string): string {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('00975')) digits = digits.slice(5);
  else if (digits.length > 8 && digits.startsWith('975')) digits = digits.slice(3);
  return digits.slice(0, 8);
}

// Default rate for each tax type
const DEFAULT_TAX_RATES: Record<string, number> = { NONE: 0, GST: 5, ET: 30, CDA: 0, VAT: 13, OTHER: 0 };
const DEFAULT_TAXES: PosTax[] = [{ type: 'GST', rate: 5, manuallyEdited: false }];
const MAX_TILES = 60;

@Component({
  selector: 'app-pos',
  imports: [FormsModule, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './pos.html',
  styleUrl: './pos.css'
})
export class Pos implements OnInit, AfterViewInit, OnDestroy {
  private itemService = inject(ItemService);
  private posService = inject(PosService);
  auth = inject(AuthService);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);
  private customerService = inject(CustomerService);

  private searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');
  private invoiceEl = viewChild<ElementRef<HTMLElement>>('invoiceEl');   // the A4 invoice
  private receiptEl = viewChild<ElementRef<HTMLElement>>('receiptEl');   // the narrow receipt
  private invoiceDialog = viewChild<ElementRef<HTMLElement>>('invoiceDialog');

  shop = SHOP;

  today = new Date();

  taxTypes = [
    { value: 'NONE', label: 'No tax' },
    { value: 'GST', label: 'GST' },
    { value: 'ET', label: 'Excise tax' },
    { value: 'CDA', label: 'CDA' },
    { value: 'VAT', label: 'VAT' },
    { value: 'OTHER', label: 'Other' }
  ];

  paymentMethods = [
    { value: 'CASH', label: 'Cash', icon: 'fa-money-bill-wave' },
    { value: 'CARD', label: 'Card', icon: 'fa-credit-card' },
    { value: 'UPI', label: 'UPI', icon: 'fa-mobile-screen' },
    { value: 'BANK_TRANSFER', label: 'Bank transfer', icon: 'fa-building-columns' }
  ];

  quickAmounts = [100, 500, 1000, 2000];

  // ---------- State ----------
  products = signal<PosProduct[]>([]);
  loadingProducts = signal(true);
  searchTerm = signal('');
  category = signal(''); // '' = every category

  cart = signal<PosLine[]>([]);
  taxes = signal<PosTax[]>(DEFAULT_TAXES.map(t => ({ ...t })));
  paymentMethod = signal('CASH');
  amountReceived = signal<number | null>(null);

  // A discount on the whole sale, as a percentage or as an amount of money
  saleDiscountMode = signal<'percent' | 'amount'>('percent');
  saleDiscountValue = signal<number | null>(null);
  customerName = '';
  customerPhone = '';

  // Recognising a returning customer by their phone number
  phoneTouched = signal(false);
  lookupState = signal<'idle' | 'loading' | 'known' | 'new' | 'unavailable'>('idle');
  customerInfo = signal<CustomerLookup | null>(null);
  private lookupCount = 0; // ignore an answer that arrives after the number changed

  processing = signal(false);
  invoice = signal<Invoice | null>(null);

  // Till v2: paying happens in its own dialog (Charge / F9); tax and whole-sale discount open only when needed
  showPay = signal(false);
  showTaxes = signal(false);
  showSaleDiscount = signal(false);

  // ---------- Cash drawer ----------
  shift = signal<ShiftReport | null>(null);
  shiftLoading = signal(true);
  shiftError = signal('');
  shiftOutdated = signal(false); // the server does not know shifts yet (older version still running)
  openingFloat: number | null = null;
  openingDrawer = signal(false);
  showClose = signal(false);
  closeReport = signal<ShiftReport | null>(null);   // live numbers in the close dialog
  countedCash: number | null = null;
  countedCashValue = signal<number | null>(null);
  closeNote = '';
  closingDrawer = signal(false);
  closedReport = signal<ShiftReport | null>(null);  // the end-of-shift report after closing
  difference = computed(() => {
    const r = this.closeReport();
    const counted = this.countedCashValue();
    return r && counted !== null ? Math.round((counted - r.expectedCash) * 100) / 100 : null;
  });

  // ---------- Permissions ----------
  // Discounts beyond the shop price need "Give extra discounts"; the server checks it too
  canDiscount = this.auth.can('pos.discount');

  // ---------- Held sales ----------
  held = signal<HeldSale[]>(readJson<HeldSale[]>(HELD_KEY, []));
  showHeld = signal(false);

  // The id of the sale being rung up. Kept when the answer is lost, so trying again can never save it twice.
  private saleRef: string | null = null;

  // customer fields are plain properties (bound to inputs); these mirror them so the saved draft sees changes
  private customerNameSig = signal('');
  private customerPhoneSig = signal('');
  showInvoice = signal(false);

  // ---------- Calculated values ----------
  // Every category in the shop, for the filter chips
  categories = computed(() =>
    [...new Set(this.products().map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  );

  matches = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const category = this.category();
    return this.products().filter(p =>
      (!category || p.category === category) &&
      (!term ||
        p.itemName.toLowerCase().includes(term) ||
        p.itemCode.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term))
    );
  });

  // What the tax line under the customer says, e.g. "GST 5%"
  taxSummary = computed(() => {
    const active = this.taxes().filter(t => t.type !== 'NONE');
    return active.length ? active.map(t => `${t.type} ${t.rate}%`).join(', ') : 'No tax';
  });

  visibleProducts = computed(() => this.matches().slice(0, MAX_TILES));

  itemCount = computed(() => this.cart().reduce((sum, l) => sum + l.quantity, 0));

  totals = computed(() => {
    let subtotal = 0;
    let afterLineDiscounts = 0;
    for (const line of this.cart()) {
      const original = line.mrp * line.quantity;
      subtotal += original;
      afterLineDiscounts += original * (1 - line.discountPercent / 100);
    }

    // The discount on the whole sale, worked out as a percentage of what is left
    const value = Number(this.saleDiscountValue()) || 0;
    const rawPercent = value > 0 && afterLineDiscounts > 0
      ? (this.saleDiscountMode() === 'percent' ? value : (value / afterLineDiscounts) * 100)
      : 0;
    const extraPercent = Math.min(100, rawPercent);
    const extraDiscount = (afterLineDiscounts * extraPercent) / 100;

    const taxable = afterLineDiscounts - extraDiscount;
    const taxLines = this.taxes()
      .filter(t => t.type !== 'NONE')
      .map(t => ({ label: `${t.type} at ${t.rate}%`, amount: (taxable * t.rate) / 100 }));
    const tax = taxLines.reduce((sum, t) => sum + t.amount, 0);

    return {
      subtotal,
      discount: subtotal - taxable, // line discounts and the whole-sale discount together
      extraDiscount,
      extraPercent,
      extraTooLarge: rawPercent > 100, // more than the sale is worth
      tax,
      taxLines,
      total: taxable + tax
    };
  });

  // Money still missing (cash) or change to hand back
  cashState = computed(() => {
    const received = this.amountReceived();
    if (received == null) return null;
    const diff = Math.round((received - this.totals().total) * 100) / 100;
    return diff >= 0 ? { ok: true, amount: diff } : { ok: false, amount: -diff };
  });

  // ---------- Phones: the sale opens over the products (the bar at the bottom shows it is there) ----------
  saleOpen = signal(false);
  lastAdded = signal<string | null>(null); // "Added Phone" in the bar, so the cashier sees the tap worked
  private lastAddedTimer?: ReturnType<typeof setTimeout>;
  // A finger, not a mouse: do not jump into the search box after each tap (that pops the keyboard up)
  private readonly touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  openSale() {
    this.saleOpen.set(true);
  }

  closeSale() {
    this.saleOpen.set(false);
  }

  searchFromBar() {
    this.saleOpen.set(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.focusSearch(true);
  }

  // ---------- Setup ----------
  // "Full screen" hides the site header, the staff bar and the footer, so the till gets the whole window.
  fullScreen = signal(localStorage.getItem('posFullScreen') !== 'no'); // on unless switched off

  toggleFullScreen() {
    this.fullScreen.update(on => !on);
    localStorage.setItem('posFullScreen', this.fullScreen() ? 'yes' : 'no');
    this.applyFullScreen();
  }

  private applyFullScreen() {
    document.getElementById('pos-fullscreen-style')?.remove();
    if (!this.fullScreen()) return;
    const style = document.createElement('style');
    style.id = 'pos-fullscreen-style';
    style.textContent = 'app-navbar, app-staff-bar, app-footer { display: none !important; }';
    document.head.appendChild(style);
  }

  ngOnDestroy() {
    document.getElementById('pos-fullscreen-style')?.remove(); // give the header back when leaving the till
  }

  constructor() {
    this.applyFullScreen();
    // keep the sale in progress, so a refresh or a crash does not lose it
    effect(() => {
      const draft = this.currentDraft();
      if (draft.cart.length === 0) localStorage.removeItem(DRAFT_KEY);
      else writeJson(DRAFT_KEY, draft);
    });
    effect(() => {
      if (this.showInvoice()) setTimeout(() => this.invoiceDialog()?.nativeElement.focus(), 0);
    });
  }

  ngOnInit() {
    this.loadProducts();
    this.loadShift();
    const draft = readJson<SaleDraft | null>(DRAFT_KEY, null);
    if (draft && Array.isArray(draft.cart) && draft.cart.length > 0) {
      this.applyDraft(draft);
      this.toasts.info('Your unfinished sale was brought back.');
    }
  }

  // ---------- Cash drawer ----------
  loadShift() {
    this.shiftLoading.set(true);
    this.shiftError.set('');
    this.shiftOutdated.set(false);
    this.posService.currentShift().subscribe({
      next: shift => {
        this.shift.set(shift);
        this.shiftLoading.set(false);
        if (shift) setTimeout(() => this.focusSearch(), 0);
      },
      error: (err: HttpErrorResponse) => {
        this.shiftLoading.set(false);
        this.shiftOutdated.set(err.status === 404);
        this.shiftError.set(errorText(err));
      }
    });
  }

  openDrawer() {
    const amount = Number(this.openingFloat ?? 0);
    if (!(amount >= 0)) {
      this.toasts.error('Enter the cash in the drawer (0 or more).');
      return;
    }
    this.openingDrawer.set(true);
    this.posService.openShift(amount).subscribe({
      next: shift => {
        this.openingDrawer.set(false);
        this.shift.set(shift);
        this.openingFloat = null;
        this.toasts.success('Drawer open. Good selling!');
        setTimeout(() => this.focusSearch(), 0);
      },
      error: (err: HttpErrorResponse) => {
        this.openingDrawer.set(false);
        this.toasts.error(errorText(err));
        this.loadShift();
      }
    });
  }

  startClose() {
    const shift = this.shift();
    if (!shift) return;
    if (this.cart().length > 0) {
      this.toasts.error('Finish or hold the current sale before closing the drawer.');
      return;
    }
    this.countedCash = null;
    this.countedCashValue.set(null);
    this.closeNote = '';
    this.closeReport.set(null);
    this.showClose.set(true);
    this.posService.shift(shift.id).subscribe({
      next: r => this.closeReport.set(r),
      error: (err: HttpErrorResponse) => this.toasts.error(errorText(err))
    });
  }

  onCounted(value: string) {
    const n = parseFloat(value);
    this.countedCash = isNaN(n) ? null : n;
    this.countedCashValue.set(this.countedCash);
  }

  closeDrawer() {
    const shift = this.shift();
    if (!shift || this.closingDrawer()) return;
    if (this.countedCash === null || this.countedCash < 0) {
      this.toasts.error('Count the cash in the drawer and enter the amount.');
      return;
    }
    const diff = this.difference();
    if (diff !== null && diff !== 0 && !this.closeNote.trim()) {
      this.toasts.error('The count does not match. Please write a short note about it.');
      return;
    }
    this.closingDrawer.set(true);
    this.posService.closeShift(shift.id, this.countedCash, this.closeNote.trim()).subscribe({
      next: report => {
        this.closingDrawer.set(false);
        this.showClose.set(false);
        this.shift.set(null);
        this.closedReport.set(report);
      },
      error: (err: HttpErrorResponse) => {
        this.closingDrawer.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  methodTotals(report: ShiftReport) {
    return Object.entries(report.salesByMethod ?? {}).map(([method, amount]) => ({ method: this.methodLabel(method), amount }));
  }

  // ---------- Draft and held sales ----------
  private currentDraft(): SaleDraft {
    return {
      cart: this.cart(),
      customerName: this.customerNameSig(),
      customerPhone: this.customerPhoneSig(),
      taxes: this.taxes(),
      paymentMethod: this.paymentMethod(),
      saleDiscountMode: this.saleDiscountMode(),
      saleDiscountValue: this.saleDiscountValue()
    };
  }

  syncCustomer() {
    this.customerNameSig.set(this.customerName);
    this.customerPhoneSig.set(this.customerPhone);
  }

  private applyDraft(d: SaleDraft) {
    this.cart.set(d.cart ?? []);
    this.customerName = d.customerName ?? '';
    this.customerPhone = d.customerPhone ?? '';
    this.syncCustomer();
    this.taxes.set(d.taxes?.length ? d.taxes : DEFAULT_TAXES.map(t => ({ ...t })));
    this.paymentMethod.set(d.paymentMethod || 'CASH');
    this.saleDiscountMode.set(d.saleDiscountMode || 'percent');
    this.saleDiscountValue.set(this.canDiscount ? d.saleDiscountValue ?? null : null);
    this.saleRef = null;
  }

  holdSale() {
    if (this.cart().length === 0) return;
    if (this.held().length >= MAX_HELD) {
      this.toasts.error('You already have ' + MAX_HELD + ' held sales. Finish one first.');
      return;
    }
    const label = this.customerName.trim() || (this.customerPhone ? 'Phone ' + this.customerPhone : 'Walk-in customer');
    const entry: HeldSale = { id: newRef(), at: new Date().toISOString(), label, total: this.totals().total, draft: this.currentDraft() };
    this.held.update(list => [entry, ...list]);
    writeJson(HELD_KEY, this.held());
    this.resetSale();
    this.toasts.info('Sale held. Serve the next customer, then bring it back from Held sales.');
    this.focusSearch();
  }

  async recallSale(entry: HeldSale) {
    if (this.cart().length > 0) {
      const ok = await this.confirm.ask({
        title: 'Replace the current sale?',
        message: 'The sale on screen will be held so you can come back to it.',
        confirmLabel: 'Hold it and bring back'
      });
      if (!ok) return;
      this.holdSale();
    }
    this.held.update(list => list.filter(h => h.id !== entry.id));
    writeJson(HELD_KEY, this.held());
    this.applyDraft(entry.draft);
    this.showHeld.set(false);
    this.focusSearch();
  }

  async dropHeld(entry: HeldSale) {
    const ok = await this.confirm.ask({
      title: 'Delete held sale?',
      message: entry.label + ', Nu. ' + entry.total.toFixed(2),
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    this.held.update(list => list.filter(h => h.id !== entry.id));
    writeJson(HELD_KEY, this.held());
  }

  ngAfterViewInit() {
    this.focusSearch();
  }

  private loadProducts() {
    this.itemService.getAll().subscribe({
      next: items => {
        // A marketplace seller's products are in the seller's own shop and sold online only: the counter never
        // sells them (the server refuses it too), so they are not offered here at all.
        const sellerItemIds = new Set(items.filter(item => item.sellerId != null).map(item => item.itemId));
        const notOurs = this.cart().filter(line => sellerItemIds.has(line.itemId));
        if (notOurs.length > 0) {
          this.cart.update(lines => lines.filter(line => !sellerItemIds.has(line.itemId)));
          this.toasts.info(`${notOurs.map(l => l.itemName).join(', ')} taken out of the sale: a marketplace seller's product, sold online only.`);
        }
        this.products.set(items.filter(item => item.sellerId == null).map(item => ({
          itemId: item.itemId,
          itemName: item.itemName || 'Unknown item',
          itemCode: item.sku || item.barcode || '',
          category: item.category || '',
          image: this.itemService.imageFor(item),
          mrp: item.mrp != null ? Number(item.mrp) : 0,
          sellingPrice: item.sellingPrice != null ? Number(item.sellingPrice) : 0,
          stock: this.itemService.stockOf(item)
        })));
        this.loadingProducts.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loadingProducts.set(false);
        this.toasts.error('We could not load the items: ' + errorText(err));
      }
    });
  }

  // "Reload products": picks up items added or restocked since this page was opened
  reloadProducts() {
    this.loadingProducts.set(true);
    this.loadProducts();
  }

  // Ready to type or scan. On a touch screen only when asked (force), because focusing pops the keyboard up.
  private focusSearch(force = false) {
    if (this.touch && !force) return;
    this.searchInput()?.nativeElement.focus();
  }

  // ---------- Keyboard shortcuts ----------
  // Scrolling the wheel while a number box (quantity, discount, tax) is selected would change its number.
  // Letting go of the box first stops that.
  @HostListener('wheel')
  onWheel() {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === 'number') active.blur();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if (event.key === 'F2') {
      event.preventDefault();
      this.focusSearch(true);
    } else if (event.key === 'F9') {
      event.preventDefault();
      if (this.showInvoice() || this.showClose() || !this.shift()) return;
      if (this.showPay()) this.completeSale();
      else this.openPay();
    } else if (event.key === 'Escape') {
      if (this.showPay()) this.closePay();
      else if (this.showInvoice()) this.closeInvoice();
      else if (this.saleOpen()) this.closeSale();
      else if (this.searchTerm()) this.clearSearch();
    }
  }

  // ---------- Search ----------
  onSearch(value: string) {
    this.searchTerm.set(value);
  }

  clearSearch() {
    this.searchTerm.set('');
    this.focusSearch(true);
  }

  // Enter adds the first match. A barcode scanner types the code and presses Enter, so it works too.
  onSearchEnter(event: Event) {
    event.preventDefault();
    // a scanner types the exact code: an exact code match wins over a name that merely contains it
    const code = this.searchTerm().trim().toLowerCase();
    const exact = code ? this.products().find(p => p.itemCode.toLowerCase() === code) : undefined;
    const first = exact ?? this.matches()[0];
    if (first) this.addProduct(first);
    else if (code) this.toasts.error('No product matches ' + this.searchTerm().trim() + '.');
  }

  isOut(product: PosProduct) {
    return product.stock !== null && product.stock <= 0;
  }

  // The exact discount (not rounded down to a whole number) that makes the counter price
  // the same as the selling price in the shop. Eight decimals keeps every total correct
  // to the cent, even for large prices and quantities.
  discountOf(product: PosProduct): number {
    if (product.mrp > 0 && product.sellingPrice < product.mrp) {
      return Math.round(((product.mrp - product.sellingPrice) / product.mrp) * 100 * 100000000) / 100000000;
    }
    return 0;
  }

  // What one costs the customer at the counter
  unitPrice(product: PosProduct): number {
    return Math.round(product.mrp * (1 - this.discountOf(product) / 100) * 100) / 100;
  }

  onTileImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }

  // ---------- Cart ----------
  addProduct(product: PosProduct) {
    if (this.isOut(product)) {
      this.toasts.error(`${product.itemName} is out of stock.`);
      return;
    }
    if (product.mrp <= 0) {
      this.toasts.error(`${product.itemName} has no MRP set. Edit the item first.`);
      return;
    }

    this.saleRef = null;
    const existing = this.cart().find(l => l.itemId === product.itemId);
    if (existing) {
      this.setLineQuantity(existing, existing.quantity + 1);
    } else {
      this.cart.update(lines => [...lines, {
        itemId: product.itemId,
        itemName: product.itemName,
        mrp: product.mrp,
        discountPercent: Math.min(100, Math.max(0, this.discountOf(product))),
        quantity: 1,
        stock: product.stock
      }]);
    }
    // ready for the next item: back in the search box when typing or scanning, but not after a finger tap
    const searching = document.activeElement === this.searchInput()?.nativeElement;
    this.searchTerm.set('');
    this.focusSearch(searching);

    this.lastAdded.set(product.itemName);
    clearTimeout(this.lastAddedTimer);
    this.lastAddedTimer = setTimeout(() => this.lastAdded.set(null), 1800);
  }

  private updateLine(itemId: number, changes: Partial<PosLine>) {
    this.saleRef = null;
    this.cart.update(lines => lines.map(l => (l.itemId === itemId ? { ...l, ...changes } : l)));
  }

  private setLineQuantity(line: PosLine, wanted: number) {
    if (wanted <= 0) {
      this.removeLine(line);
      return;
    }
    if (line.stock !== null && wanted > line.stock) {
      this.toasts.info(`Only ${line.stock} of ${line.itemName} in stock.`);
      wanted = line.stock;
    }
    this.updateLine(line.itemId, { quantity: wanted });
  }

  changeQty(line: PosLine, delta: number) {
    this.setLineQuantity(line, line.quantity + delta);
  }

  onQtyInput(line: PosLine, input: HTMLInputElement) {
    const qty = parseInt(input.value, 10);
    if (qty > 0) this.setLineQuantity(line, qty);
    input.value = String(this.cart().find(l => l.itemId === line.itemId)?.quantity ?? line.quantity);
  }

  onDiscountInput(line: PosLine, input: HTMLInputElement) {
    if (!this.canDiscount) {
      input.value = String(line.discountPercent);
      return;
    }
    const discount = Math.min(100, Math.max(0, parseFloat(input.value) || 0));
    this.updateLine(line.itemId, { discountPercent: discount });
    input.value = String(discount);
  }

  removeLine(line: PosLine) {
    this.saleRef = null;
    this.cart.update(lines => lines.filter(l => l.itemId !== line.itemId));
  }

  lineTotal(line: PosLine) {
    const original = line.mrp * line.quantity;
    return original - (original * line.discountPercent) / 100;
  }

  async clearSale() {
    if (this.cart().length > 0) {
      const ok = await this.confirm.ask({
        title: 'Clear this sale',
        message: 'Remove every item from the current sale? This cannot be undone.',
        confirmLabel: 'Clear sale',
        cancelLabel: 'Keep it',
        danger: true
      });
      if (!ok) return;
    }
    this.resetSale();
    this.focusSearch();
  }

  // ---------- Discount on the whole sale ----------
  onSaleDiscountInput(box: HTMLInputElement) {
    this.saleDiscountValue.set(box.value === '' ? null : Math.max(0, parseFloat(box.value) || 0));
  }

  // One item's own discount plus its share of the whole-sale discount, as a single percentage.
  // This is what is sent to the server, so the server's total matches the ticket.
  private effectiveDiscount(line: PosLine): number {
    const extra = this.totals().extraPercent;
    const combined = 100 * (1 - (1 - line.discountPercent / 100) * (1 - extra / 100));
    return Math.round(combined * 100000000) / 100000000;
  }

  private lineTotalAfterAll(line: PosLine): number {
    return line.mrp * line.quantity * (1 - this.effectiveDiscount(line) / 100);
  }

  // ---------- Taxes ----------
  addTax() {
    this.taxes.update(t => [...t, { type: 'GST', rate: 5, manuallyEdited: false }]);
  }

  removeTax(index: number) {
    this.taxes.update(t => t.filter((_, i) => i !== index));
  }

  setTaxType(index: number, type: string) {
    this.taxes.update(t => t.map((tax, i) => i !== index ? tax : {
      ...tax,
      type,
      rate: tax.manuallyEdited ? tax.rate : (DEFAULT_TAX_RATES[type] ?? 0)
    }));
  }

  setTaxRate(index: number, value: string) {
    this.taxes.update(t => t.map((tax, i) => i !== index ? tax : {
      ...tax,
      rate: parseFloat(value) || 0,
      manuallyEdited: true
    }));
  }

  // ---------- Customer phone ----------
  // The phone is optional. If it is filled in, it must be a full 8-digit number.
  phoneProblem(): string {
    const phone = this.customerPhone.trim();
    return phone && !/^[0-9]{8}$/.test(phone) ? 'Enter an 8-digit phone number, or leave it empty.' : '';
  }

  // Called from the phone box. It also puts the cleaned number back into the box,
  // so letters, spaces and "+975" never stay visible.
  onPhoneInput(box: HTMLInputElement) {
    this.customerPhone = cleanPhone(box.value);
    box.value = this.customerPhone;
    this.syncCustomer();
    this.customerInfo.set(null);

    if (this.customerPhone.length !== 8) {
      this.lookupState.set('idle');
      return;
    }

    const phone = this.customerPhone;
    const thisLookup = ++this.lookupCount;
    this.lookupState.set('loading');
    this.customerService.lookup(phone).subscribe({
      next: info => {
        if (thisLookup !== this.lookupCount) return; // the number changed meanwhile
        if (info.found) {
          this.customerInfo.set(info);
          this.lookupState.set('known');
          // fill in the name they gave last time, unless the cashier already typed one
          if (!this.customerName.trim() && info.name) {
            this.customerName = info.name;
            this.syncCustomer();
          }
        } else {
          this.lookupState.set('new');
        }
      },
      // The server cannot answer yet: say nothing, the sale still works
      error: () => {
        if (thisLookup === this.lookupCount) this.lookupState.set('unavailable');
      }
    });
  }

  // ---------- Payment ----------
  choosePayment(method: string) {
    this.paymentMethod.set(method);
    if (method === 'CASH') {
      setTimeout(() => this.amountInput()?.nativeElement.select(), 50);
    } else {
      this.amountReceived.set(null);
    }
  }

  // Only digits and one decimal point, with at most 2 decimals. It is a text box, not a number box,
  // so the mouse wheel and the arrow keys can never change the amount.
  onAmountInput(box: HTMLInputElement) {
    let text = box.value.replace(/[^0-9.]/g, '');
    const dot = text.indexOf('.');
    if (dot !== -1) text = text.slice(0, dot + 1) + text.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    box.value = text;
    const value = parseFloat(text);
    this.amountReceived.set(text === '' || isNaN(value) ? null : value);
  }

  setReceived(amount: number) {
    this.amountReceived.set(amount);
  }

  setExact() {
    this.amountReceived.set(Math.round(this.totals().total * 100) / 100);
  }

  // ---------- Charge: open the payment dialog ----------
  openPay() {
    if (this.processing()) return;
    if (!this.shift()) {
      this.toasts.error('Open your cash drawer first.');
      return;
    }
    if (this.cart().length === 0) {
      this.toasts.error('Add at least one item to the sale first.');
      return;
    }
    const phoneProblem = this.phoneProblem();
    if (phoneProblem) {
      this.phoneTouched.set(true);
      this.toasts.error(phoneProblem);
      return;
    }
    if (this.totals().extraTooLarge) {
      this.toasts.error('The discount is bigger than the whole sale. Lower it first.');
      return;
    }
    this.showPay.set(true);
    if (this.paymentMethod() === 'CASH') setTimeout(() => this.amountInput()?.nativeElement.focus(), 50);
  }

  closePay() {
    if (this.processing()) return;
    this.showPay.set(false);
    this.focusSearch();
  }

  // ---------- Complete sale ----------
  completeSale() {
    if (this.processing()) return;
    if (!this.shift()) {
      this.toasts.error('Open your cash drawer first.');
      return;
    }

    const lines = this.cart();
    if (lines.length === 0) {
      this.toasts.error('Add at least one item to the sale first.');
      return;
    }

    const phoneProblem = this.phoneProblem();
    if (phoneProblem) {
      this.phoneTouched.set(true);
      this.toasts.error(phoneProblem);
      return;
    }

    if (this.totals().extraTooLarge) {
      this.toasts.error('The discount is bigger than the whole sale. Lower it first.');
      return;
    }

    const totals = this.totals();
    const method = this.paymentMethod();
    if (method === 'CASH') {
      const received = this.amountReceived() ?? 0;
      const total = Math.round(totals.total * 100) / 100;
      if (received < total) {
        this.toasts.error(`Cash received (Nu. ${received.toFixed(2)}) is less than the total (Nu. ${total.toFixed(2)}).`);
        return;
      }
    }

    if (!this.saleRef) this.saleRef = newRef();
    const request: PosSaleRequest = {
      clientRef: this.saleRef,
      amountTendered: method === 'CASH' ? this.amountReceived() : null,
      customerName: this.customerName.trim() || null,
      customerPhone: this.customerPhone.trim() || null,
      paymentMethod: method,
      taxes: this.taxes().filter(t => t.type !== 'NONE').map(t => ({ type: t.type, rate: t.rate })),
      items: lines.map(l => ({ itemId: l.itemId, quantity: l.quantity, mrp: l.mrp, discountPercent: this.effectiveDiscount(l) }))
    };

    this.processing.set(true);
    this.posService.sale(request).subscribe({
      next: order => {
        // Keep what was sold for the invoice BEFORE clearing the sale
        const received = method === 'CASH' ? this.amountReceived() : null;
        this.invoice.set({
          orderId: order.orderId,
          date: new Date(),
          cashier: this.auth.name() ?? '',
          customerName: order.customerName ?? request.customerName,
          customerPhone: order.customerPhone ?? request.customerPhone,
          paymentMethod: order.paymentMethod ?? method,
          cashReceived: received,
          change: received !== null ? Math.max(0, Math.round((received - totals.total) * 100) / 100) : null,
          lines: lines.map(l => ({
            name: l.itemName,
            qty: l.quantity,
            mrp: l.mrp,
            discountPercent: Math.round(this.effectiveDiscount(l) * 100) / 100,
            total: this.lineTotalAfterAll(l)
          })),
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxLines: totals.taxLines,
          total: totals.total
        });

        this.resetSale();
        this.processing.set(false);
        this.showPay.set(false);
        this.posService.currentShift().subscribe({ next: s => this.shift.set(s), error: () => {} });
        this.toasts.success(`Sale #${order.orderId} completed.`);
        this.showInvoice.set(true);
        this.loadProducts(); // stock changed, refresh the tiles
      },
      error: (err: HttpErrorResponse) => {
        this.processing.set(false);
        if (err.status === 0) {
          // the answer was lost: the sale may or may not be saved. Pressing Complete again is safe (same id).
          this.toasts.error('No answer from the server. Press Complete sale again when the connection is back; it will not be saved twice.');
          return;
        }
        this.saleRef = null;
        this.toasts.error(`The sale was not saved: ${errorText(err)}`);
        if (/cash drawer/i.test(errorText(err))) this.loadShift();
      }
    });
  }

  private resetSale() {
    this.saleRef = null;
    this.saleOpen.set(false);
    this.showSaleDiscount.set(false);
    this.showTaxes.set(false);
    this.cart.set([]);
    this.taxes.set(DEFAULT_TAXES.map(t => ({ ...t })));
    this.paymentMethod.set('CASH');
    this.customerName = '';
    this.customerPhone = '';
    this.syncCustomer();
    this.phoneTouched.set(false);
    this.lookupState.set('idle');
    this.customerInfo.set(null);
    this.amountReceived.set(null);
    this.saleDiscountValue.set(null);
    this.saleDiscountMode.set('percent');
  }

  // ---------- Invoice ----------
  closeInvoice() {
    this.showInvoice.set(false);
    this.focusSearch();
  }

  // The end-of-shift report, on the receipt printer (same way as the receipt below)
  printShiftReport() {
    const source = document.querySelector<HTMLElement>('.shift-report');
    if (!source) return;
    document.getElementById('print-root')?.remove();
    document.getElementById('print-style')?.remove();
    const root = document.createElement('div');
    root.id = 'print-root';
    root.innerHTML = source.outerHTML;
    root.querySelector('.dw-actions')?.remove();
    const style = document.createElement('style');
    style.id = 'print-style';
    style.textContent = `
      #print-root { display: none; }
      @media print {
        @page { size: 80mm auto; margin: 3mm; }
        html, body { background: #fff !important; margin: 0 !important; }
        body > *:not(#print-root) { display: none !important; }
        #print-root { display: block !important; font-family: monospace; font-size: 12px; width: 74mm; }
        #print-root .dw-dialog { position: static; transform: none; width: auto; box-shadow: none; padding: 0; }
        #print-root .dw-report div { display: flex; justify-content: space-between; }
      }`;
    document.body.appendChild(root);
    document.head.appendChild(style);
    const cleanup = () => {
      root.remove();
      style.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  // Prints either the narrow receipt (for a receipt printer) or the A4 invoice.
  // It copies the chosen layout into its own area and hides the rest of the page while printing,
  // so it does not depend on anything in styles.css.
  printInvoice(kind: 'receipt' | 'a4') {
    const source = (kind === 'receipt' ? this.receiptEl() : this.invoiceEl())?.nativeElement;
    if (!source) {
      this.toasts.error('The invoice is not ready yet. Please try again.');
      return;
    }

    // clear anything left from an earlier print
    document.getElementById('print-root')?.remove();
    document.getElementById('print-style')?.remove();

    const root = document.createElement('div');
    root.id = 'print-root';
    root.innerHTML = source.outerHTML;

    const page = kind === 'receipt' ? '@page { size: 80mm auto; margin: 3mm; }' : '@page { size: A4; margin: 12mm; }';
    const style = document.createElement('style');
    style.id = 'print-style';
    style.textContent = `
      #print-root { display: none; }
      @media print {
        ${page}
        html, body { background: #fff !important; margin: 0 !important; }
        body > *:not(#print-root) { display: none !important; }
        #print-root { display: block !important; }
        #print-root .sheet { box-shadow: none !important; padding: 0 !important; max-width: none !important; }
        #print-root .receipt-print { display: block !important; width: 74mm; }
      }`;

    document.body.appendChild(root);
    document.head.appendChild(style);

    const cleanup = () => {
      root.remove();
      style.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  // What the customer was charged for one, after every discount
  unitNet(line: { qty: number; total: number }): number {
    return line.qty > 0 ? line.total / line.qty : 0;
  }

  methodLabel(method: string): string {
    switch ((method ?? '').toUpperCase()) {
      case 'CASH': return 'Cash';
      case 'CARD': return 'Card';
      case 'UPI': return 'UPI';
      case 'BANK_TRANSFER': return 'Bank transfer';
      default: return method;
    }
  }

  async downloadPdf() {
    const element = this.invoiceEl()?.nativeElement;
    if (!element) {
      this.toasts.error('The invoice is not ready yet. Please try again.');
      return;
    }
    try {
      // Loaded only when needed, so the POS page opens faster
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const props = pdf.getImageProperties(imgData);
      const width = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageHeight = (props.height * width) / props.width;

      pdf.addImage(imgData, 'PNG', 0, 0, width, imageHeight);
      let left = imageHeight - pageHeight;
      while (left > 0) {
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, left - imageHeight, width, imageHeight);
        left -= pageHeight;
      }
      pdf.save(`Invoice_${this.invoice()?.orderId ?? 'POS'}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      this.toasts.error('Could not create the PDF. Try Print instead.');
    }
  }
}
