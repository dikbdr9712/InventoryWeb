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
import { PosSaleRequest, PosTax } from '../../models/models';
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
    effect(() => {
      if (this.showInvoice()) setTimeout(() => this.invoiceDialog()?.nativeElement.focus(), 0);
    });
  }

  ngOnInit() {
    this.loadProducts();
  }

  ngAfterViewInit() {
    this.focusSearch();
  }

  private loadProducts() {
    this.itemService.getAll().subscribe({
      next: items => {
        this.products.set(items.map(item => ({
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

  private focusSearch() {
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
      this.focusSearch();
    } else if (event.key === 'F9') {
      event.preventDefault();
      if (!this.showInvoice()) this.completeSale();
    } else if (event.key === 'Escape') {
      if (this.showInvoice()) this.closeInvoice();
      else if (this.searchTerm()) this.clearSearch();
    }
  }

  // ---------- Search ----------
  onSearch(value: string) {
    this.searchTerm.set(value);
  }

  clearSearch() {
    this.searchTerm.set('');
    this.focusSearch();
  }

  // Enter adds the first match. A barcode scanner types the code and presses Enter, so it works too.
  onSearchEnter(event: Event) {
    event.preventDefault();
    const first = this.matches()[0];
    if (first) this.addProduct(first);
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
    this.clearSearch(); // ready for the next item
  }

  private updateLine(itemId: number, changes: Partial<PosLine>) {
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
    const discount = Math.min(100, Math.max(0, parseFloat(input.value) || 0));
    this.updateLine(line.itemId, { discountPercent: discount });
    input.value = String(discount);
  }

  removeLine(line: PosLine) {
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
          if (!this.customerName.trim() && info.name) this.customerName = info.name;
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

  // ---------- Complete sale ----------
  completeSale() {
    if (this.processing()) return;

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

    const request: PosSaleRequest = {
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
        this.toasts.success(`Sale #${order.orderId} completed.`);
        this.showInvoice.set(true);
        this.loadProducts(); // stock changed, refresh the tiles
      },
      error: (err: HttpErrorResponse) => {
        this.processing.set(false);
        this.toasts.error(`The sale was not saved: ${errorText(err)}`);
      }
    });
  }

  private resetSale() {
    this.cart.set([]);
    this.taxes.set(DEFAULT_TAXES.map(t => ({ ...t })));
    this.paymentMethod.set('CASH');
    this.customerName = '';
    this.customerPhone = '';
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
