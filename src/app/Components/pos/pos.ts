import { AfterViewInit, Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ItemService } from '../../services/item';
import { PosService } from '../../services/pos';
import { PosSaleRequest, PosTax } from '../../models/models';
import { errorText } from '../../utils/http-error';

interface PosProduct {
  itemId: number;
  itemName: string;
  itemCode: string;
  mrp: number;
  sellingPrice: number;
}

interface PosLine {
  itemId: number;
  itemName: string;
  mrp: number;
  discountPercent: number;
  quantity: number;
}

interface Invoice {
  orderId?: number;
  date: Date;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string;
  lines: { name: string; qty: number; mrp: number; total: number }[];
  subtotal: number;
  discount: number;
  taxLines: { label: string; amount: number }[];
  total: number;
}

// Default rate for each tax type (same as pos.js)
const DEFAULT_TAX_RATES: Record<string, number> = { NONE: 0, GST: 5, ET: 30, CDA: 0, VAT: 13, OTHER: 0 };

// Replaces pos.html / pos.js
@Component({
  selector: 'app-pos',
  imports: [FormsModule, DecimalPipe, DatePipe],
  templateUrl: './pos.html',
  styleUrl: './pos.css'
})
export class Pos implements OnInit, AfterViewInit {
  private itemService = inject(ItemService);
  private posService = inject(PosService);

  private searchWrap = viewChild<ElementRef<HTMLElement>>('searchWrap');
  private searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');
  private invoiceEl = viewChild<ElementRef<HTMLElement>>('invoiceEl');

  taxTypes = [
    { value: 'NONE', label: 'No Tax' },
    { value: 'GST', label: 'GST' },
    { value: 'ET', label: 'Excise Tax' },
    { value: 'CDA', label: 'CDA' },
    { value: 'VAT', label: 'VAT' },
    { value: 'OTHER', label: 'Other' }
  ];

  // ---------- State ----------
  products = signal<PosProduct[]>([]);
  searchTerm = signal('');
  showResults = signal(false);
  highlighted = signal(-1);

  cart = signal<PosLine[]>([]);
  taxes = signal<PosTax[]>([{ type: 'GST', rate: 5, manuallyEdited: false }]);
  paymentMethod = signal('BANK_TRANSFER');
  amountReceived = signal<number | null>(null);
  customerName = '';
  customerPhone = '';

  processing = signal(false);
  invoice = signal<Invoice | null>(null);
  showInvoice = signal(false);

  // ---------- Calculated values (update automatically) ----------
  matches = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return [];
    return this.products().filter(p =>
      p.itemName.toLowerCase().includes(term) || (p.itemCode && p.itemCode.toLowerCase().includes(term))
    );
  });

  totals = computed(() => {
    let subtotal = 0;
    let discount = 0;
    for (const line of this.cart()) {
      const original = line.mrp * line.quantity;
      subtotal += original;
      discount += (original * line.discountPercent) / 100;
    }
    const taxable = subtotal - discount;
    const taxLines = this.taxes()
      .filter(t => t.type !== 'NONE')
      .map(t => ({ label: `${t.type} @ ${t.rate}%`, amount: (taxable * t.rate) / 100 }));
    const tax = taxLines.reduce((sum, t) => sum + t.amount, 0);
    return { subtotal, discount, tax, taxLines, total: taxable + tax };
  });

  changeText = computed(() => {
    const received = this.amountReceived();
    if (received == null) return '';
    const change = received - this.totals().total;
    return change >= 0 ? `Nu. ${change.toFixed(2)}` : 'Insufficient!';
  });

  // ---------- Setup ----------
  ngOnInit() {
    this.itemService.getAll().subscribe({
      next: items => this.products.set(items.map(item => ({
        itemId: item.itemId,
        itemName: item.itemName || 'Unknown Item',
        itemCode: item.sku || item.barcode || '',
        mrp: item.mrp != null ? Number(item.mrp) : 0,
        sellingPrice: item.sellingPrice != null ? Number(item.sellingPrice) : 0
      }))),
      error: (err: HttpErrorResponse) => alert('Error loading items: ' + errorText(err))
    });
  }

  ngAfterViewInit() {
    this.focusSearch();
  }

  private focusSearch() {
    this.searchInput()?.nativeElement.focus();
  }

  // ---------- Search ----------
  onSearch(value: string) {
    this.searchTerm.set(value);
    this.showResults.set(value.trim().length > 0);
    this.highlighted.set(-1);
  }

  clearSearch() {
    this.onSearch('');
    this.focusSearch();
  }

  // Arrow keys / Enter / Escape in the search box
  onSearchKey(event: KeyboardEvent) {
    const list = this.matches();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlighted.set(Math.min(this.highlighted() + 1, list.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlighted.set(Math.max(this.highlighted() - 1, -1));
    } else if (event.key === 'Enter' && this.highlighted() >= 0) {
      event.preventDefault();
      this.pick(list[this.highlighted()]);
    } else if (event.key === 'Escape') {
      this.showResults.set(false);
      this.highlighted.set(-1);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const wrap = this.searchWrap()?.nativeElement;
    if (wrap && !wrap.contains(event.target as Node)) {
      this.showResults.set(false);
      this.highlighted.set(-1);
    }
  }

  // ---------- Cart ----------
  pick(product: PosProduct) {
    let defaultDiscount = 0;
    if (product.mrp > 0 && product.sellingPrice < product.mrp) {
      defaultDiscount = Math.floor(((product.mrp - product.sellingPrice) / product.mrp) * 100);
    }
    this.addToCart(product, defaultDiscount);
  }

  private addToCart(product: PosProduct, discountPercent: number) {
    if (product.mrp <= 0) {
      alert(`Invalid MRP for ${product.itemName}.`);
      return;
    }
    const existing = this.cart().find(l => l.itemId === product.itemId);
    if (existing) {
      this.updateLine(product.itemId, { quantity: existing.quantity + 1 });
    } else {
      this.cart.update(lines => [...lines, {
        itemId: product.itemId,
        itemName: product.itemName,
        mrp: product.mrp,
        discountPercent: Math.min(100, Math.max(0, discountPercent)),
        quantity: 1
      }]);
    }
    this.clearSearch(); // ready for the next item
  }

  private updateLine(itemId: number, changes: Partial<PosLine>) {
    this.cart.update(lines => lines.map(l => (l.itemId === itemId ? { ...l, ...changes } : l)));
  }

  setQuantity(line: PosLine, input: HTMLInputElement) {
    const qty = parseInt(input.value, 10);
    if (qty > 0) this.updateLine(line.itemId, { quantity: qty });
    input.value = String(this.cart().find(l => l.itemId === line.itemId)?.quantity ?? line.quantity);
  }

  setDiscount(line: PosLine, input: HTMLInputElement) {
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

  // ---------- Payment ----------
  onPaymentMethodChange(method: string) {
    this.paymentMethod.set(method);
    if (method === 'CASH') {
      // wait for the cash box to appear, then focus it
      setTimeout(() => {
        const input = this.amountInput()?.nativeElement;
        input?.focus();
        input?.select();
      }, 100);
    } else {
      this.amountReceived.set(null);
    }
  }

  onAmountInput(value: string) {
    this.amountReceived.set(value === '' ? null : parseFloat(value));
  }

  // ---------- Complete sale ----------
  completeSale() {
    const lines = this.cart();
    if (lines.length === 0) {
      alert('⚠️ Please add at least one item to the cart.');
      return;
    }

    const totals = this.totals();
    const method = this.paymentMethod();
    if (method === 'CASH') {
      const received = this.amountReceived() ?? 0;
      const total = Math.round(totals.total * 100) / 100;
      if (received < total) {
        alert(`❌ Insufficient amount received! You entered Nu. ${received.toFixed(2)}, but total is Nu. ${total.toFixed(2)}.`);
        return;
      }
    }

    if (lines.some(l => l.mrp <= 0)) {
      alert('⚠️ Some items have invalid MRP. Please reload items.');
      return;
    }

    const request: PosSaleRequest = {
      customerName: this.customerName.trim() || null,
      customerPhone: this.customerPhone.trim() || null,
      paymentMethod: method,
      taxes: this.taxes().filter(t => t.type !== 'NONE').map(t => ({ type: t.type, rate: t.rate })),
      items: lines.map(l => ({ itemId: l.itemId, quantity: l.quantity, mrp: l.mrp, discountPercent: l.discountPercent || 0 }))
    };

    this.processing.set(true);
    this.posService.sale(request).subscribe({
      next: order => {
        // Save what was sold for the invoice BEFORE clearing the cart
        this.invoice.set({
          orderId: order.orderId,
          date: new Date(),
          customerName: order.customerName ?? request.customerName,
          customerPhone: order.customerPhone ?? request.customerPhone,
          paymentMethod: order.paymentMethod ?? method,
          lines: lines.map(l => ({ name: l.itemName, qty: l.quantity, mrp: l.mrp, total: this.lineTotal(l) })),
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxLines: totals.taxLines,
          total: totals.total
        });

        alert(`✅ Sale completed! Order #${order.orderId}`);
        this.resetSale();
        this.processing.set(false);
        this.showInvoice.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.processing.set(false);
        alert(`❌ Sale failed: ${errorText(err)}`);
      }
    });
  }

  private resetSale() {
    this.cart.set([]);
    this.taxes.set([{ type: 'GST', rate: 5, manuallyEdited: false }]);
    this.customerName = '';
    this.customerPhone = '';
    this.amountReceived.set(null);
  }

  // ---------- Invoice ----------
  closeInvoice() {
    this.showInvoice.set(false);
    this.focusSearch();
  }

  printInvoice() {
    // styles.css hides everything except the invoice while this class is on <body>
    document.body.classList.add('printing-invoice');
    window.print();
    document.body.classList.remove('printing-invoice');
  }

  async downloadPdf() {
    const element = this.invoiceEl()?.nativeElement;
    if (!element) {
      alert('❌ Invoice preview not loaded.');
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
      pdf.addImage(imgData, 'PNG', 0, 0, width, (props.height * width) / props.width);
      pdf.save(`DP_Invoice_${this.invoice()?.orderId ?? 'POS'}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('❌ Failed to generate PDF. Try printing instead.');
    }
  }
}
