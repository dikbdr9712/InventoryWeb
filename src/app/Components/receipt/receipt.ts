import { Component, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OrderService } from '../../services/order';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { Receipt as ReceiptData } from '../../models/models';
import { SHOP } from '../../utils/shop-info';
import { printElement } from '../../utils/print-area';
import { downloadPdf } from '../../utils/pdf';
import { errorText } from '../../utils/http-error';

// The payment receipt of a paid order: online orders and counter sales, with the journal number of the payment.
// Same page on a computer and a phone (the layout follows the width it has); the PDF always has the computer layout.
@Component({
  selector: 'app-receipt',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './receipt.html',
  styleUrl: './receipt.css'
})
export class Receipt implements OnInit {
  private orders = inject(OrderService);
  private route = inject(ActivatedRoute);
  private toasts = inject(ToastService);
  auth = inject(AuthService);

  private sheet = viewChild<ElementRef<HTMLElement>>('sheet');

  readonly shop = SHOP;
  orderId = Number(this.route.snapshot.paramMap.get('orderId'));
  receipt = signal<ReceiptData | null>(null);
  error = signal('');
  saving = signal(false);

  ngOnInit() {
    this.orders.receipt(this.orderId).subscribe({
      next: r => this.receipt.set(r),
      error: (err: HttpErrorResponse) => this.error.set(errorText(err))
    });
  }

  // Back to where receipts are opened from: staff to Sales history (counter sales), customers to the order
  get backLink(): string[] {
    const r = this.receipt();
    if (r?.source === 'POS' && this.auth.can('pos.use')) return ['/pos-history'];
    return ['/orders', String(this.orderId)];
  }

  async download() {
    const el = this.sheet()?.nativeElement;
    if (!el || this.saving()) return;
    this.saving.set(true);
    try {
      await downloadPdf(el, `Receipt_${this.orderId}.pdf`);
    } catch (err) {
      console.error('PDF failed', err);
      this.toasts.error('Could not create the PDF. Try Print and choose "Save as PDF".');
    } finally {
      this.saving.set(false);
    }
  }

  print() {
    const el = this.sheet()?.nativeElement;
    if (el) printElement(el, 'a4');
  }
}
