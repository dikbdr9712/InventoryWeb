import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { OrderService } from '../../services/order';
import { PaymentService } from '../../services/payment';
import { ConfirmService } from '../../services/confirm';
import { BankPaymentToCheck, OnlinePaymentsService } from '../../services/online-payments';
import { ToastService } from '../../services/toast';
import { Order, PaymentRecord } from '../../models/models';
import { errorText } from '../../utils/http-error';

type VerifyOrder = Order & { payment: PaymentRecord | null };

interface Decision {
  key: string;
  button: string;   // text on the button
  verb: string;     // used in the question: "Mark the payment as ..."
  status: string;   // value the server stores for the payment
  note: string;     // note saved on the order
  style: string;    // button style
  danger: boolean;
}

// Same status values and notes as before, now as one list
const DECISIONS: Decision[] = [
  { key: 'PAID', button: 'Mark as paid', verb: 'fully paid', status: 'PAID',
    note: 'Payment verified as fully paid.', style: 'btn-primary', danger: false },
  { key: 'PARTIALLY_PAID', button: 'Partly paid', verb: 'partly paid', status: 'partially_paid',
    note: 'Payment verified as partially paid.', style: 'btn-outline-secondary', danger: false },
  { key: 'PENDING_INFO', button: 'Ask for info', verb: 'waiting for more information', status: 'pending_info',
    note: 'Customer contacted for additional payment proof.', style: 'btn-outline-secondary', danger: false },
  { key: 'REJECTED', button: 'Reject', verb: 'rejected', status: 'rejected',
    note: 'Payment rejected due to invalid proof.', style: 'btn-outline-danger', danger: true },
  { key: 'FAILED', button: 'Mark failed', verb: 'failed', status: 'failed',
    note: 'Payment marked as failed.', style: 'btn-outline-danger', danger: true }
];

// Quick messages staff can tap instead of typing
const INFO_TEMPLATES = [
  'Please send a clear photo of your bank transfer receipt.',
  'The journal number you entered was not found. Please check it and send it again.',
  'The amount we received is less than the order total. Please send the missing amount.',
  'Please tell us the name on the account you paid from.'
];

const REJECT_TEMPLATES = [
  'The journal number does not match our bank record.',
  'The amount paid is less than the order total.',
  'The receipt is not clear enough to check.'
];

@Component({
  selector: 'app-order-verification',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './order-verification.html',
  styleUrl: './order-verification.css'
})
export class OrderVerification implements OnInit {
  private orderService = inject(OrderService);
  private paymentService = inject(PaymentService);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);
  private onlinePayments = inject(OnlinePaymentsService);

  // Payments from a bank account whose result the bank never sent: ask the bank, then settle them here
  bankChecks = signal<BankPaymentToCheck[]>([]);
  settling = signal<string | null>(null);

  decisions = DECISIONS;

  orders = signal<VerifyOrder[]>([]);
  loading = signal(true);
  error = signal('');
  searchTerm = signal('');
  sortOrder = signal<'asc' | 'desc'>('desc');
  busyId = signal<number | null>(null);

  visible = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    let list = this.orders();
    if (term) {
      list = list.filter(o =>
        String(o.orderId).includes(term) ||
        (o.customerName || '').toLowerCase().includes(term) ||
        (o.customerEmail || '').toLowerCase().includes(term) ||
        (o.payment?.journalNumber || '').toLowerCase().includes(term)
      );
    }
    return [...list].sort((a, b) =>
      this.sortOrder() === 'asc' ? (a.orderId || 0) - (b.orderId || 0) : (b.orderId || 0) - (a.orderId || 0)
    );
  });

  ngOnInit() {
    this.load();
    this.loadBankChecks();
  }

  loadBankChecks() {
    this.onlinePayments.bankToCheck().subscribe({ next: list => this.bankChecks.set(list), error: () => this.bankChecks.set([]) });
  }

  async settleBank(check: BankPaymentToCheck, paid: boolean) {
    let journal: string | null = null;
    if (paid) {
      journal = await this.confirm.prompt({
        title: `The money for order #${check.orderId} arrived`,
        message: `Type the journal number the bank gave for Nu. ${check.amount} from ${check.bankName} account ending ${check.accountLast4}. The order is then confirmed and the customer gets a receipt.`,
        label: 'Journal number from the bank',
        placeholder: 'For example: 1234567890',
        confirmLabel: 'Confirm the payment'
      });
      if (!journal) return;
    } else {
      const ok = await this.confirm.ask({
        title: `No money was taken for order #${check.orderId}`,
        message: 'The bank confirmed that this payment did not go through? The customer can then pay again.',
        confirmLabel: 'Nothing was taken',
        danger: true
      });
      if (!ok) return;
    }
    this.settling.set(check.reference);
    this.onlinePayments.bankSettle(check.reference, paid, journal).subscribe({
      next: () => {
        this.settling.set(null);
        this.toasts.success(paid ? `Order #${check.orderId} is paid and confirmed.` : `Order #${check.orderId}: the customer can pay again.`);
        this.loadBankChecks();
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.settling.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  load() {
    this.orderService.getByStatus('CREATED').pipe(
      // fetch each order's payment record at the same time
      switchMap(orders => orders.length === 0
        ? of([] as VerifyOrder[])
        : forkJoin(orders.map(order =>
            this.paymentService.getByOrder(order.orderId).pipe(
              map(payment => ({ ...order, payment })),
              catchError(() => of({ ...order, payment: null }))
            )
          ))
      )
    ).subscribe({
      next: list => {
        this.orders.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('We could not load the orders. Please try again in a moment.');
        this.loading.set(false);
      }
    });
  }

  // The payment amount should match what the order costs
  amountDiffers(order: VerifyOrder): boolean {
    const paid = Number(order.payment?.amount);
    return !!order.payment?.amount && Math.abs(paid - Number(order.totalAmount)) > 0.009;
  }

  // Already asked the customer for something and waiting for them?
  waitingForCustomer(order: VerifyOrder): boolean {
    return (order.paymentStatus ?? '').toUpperCase() === 'PENDING_INFO';
  }

  methodLabel(order: VerifyOrder): string {
    const method = (order.payment?.paymentMethod || '').toLowerCase();
    if (method === 'bank') return 'Bank transfer';
    if (method === 'cod') return 'Cash on delivery';
    return order.payment?.paymentMethod || 'Not recorded';
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => this.toasts.success('Journal number copied'),
      () => this.toasts.error('Could not copy. Please select and copy it by hand.')
    );
  }

  async decide(order: VerifyOrder, decision: Decision) {
    const paymentId = order.payment?.paymentId ?? order.payment?.id;
    if (!paymentId) {
      this.toasts.error('This order has no payment record to update.');
      return;
    }

    // What the customer will be shown. "Ask for info" and "Reject" must say why.
    let note = decision.note;

    if (decision.key === 'PENDING_INFO') {
      const message = await this.confirm.prompt({
        title: `Ask for more information on order #${order.orderId}`,
        message: 'Tell the customer exactly what you need. They will see this on their order page.',
        label: 'Message to the customer',
        placeholder: 'For example: Please send a clear photo of your bank receipt.',
        templates: INFO_TEMPLATES,
        confirmLabel: 'Send request'
      });
      if (!message) return;
      note = message;
    } else if (decision.key === 'REJECTED') {
      const reason = await this.confirm.prompt({
        title: `Reject the payment for order #${order.orderId}`,
        message: 'Give the reason. The customer will see it on their order page.',
        label: 'Reason',
        placeholder: 'For example: The journal number does not match our bank record.',
        templates: REJECT_TEMPLATES,
        confirmLabel: 'Reject payment',
        danger: true
      });
      if (!reason) return;
      note = reason;
    } else {
      const ok = await this.confirm.ask({
        title: decision.button,
        message: `Mark the payment for order #${order.orderId} as ${decision.verb}?`,
        confirmLabel: decision.button,
        danger: decision.danger
      });
      if (!ok) return;
    }

    this.busyId.set(order.orderId);

    // Step 1: update the payment. Step 2: save the note and who did it on the order.
    this.paymentService.updateStatus(paymentId, decision.status).subscribe({
      next: () => {
        this.orderService.verify(order.orderId, { status: null, paymentStatus: decision.status, note }).subscribe({
          next: () => {
            this.busyId.set(null);
            this.toasts.success(`Order #${order.orderId}: payment marked as ${decision.verb}.`);
            this.load();
          },
          error: (err: HttpErrorResponse) => {
            this.busyId.set(null);
            this.toasts.error('The payment was updated, but saving the note failed: ' + errorText(err));
            this.load();
          }
        });
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.toasts.error('We could not update the payment: ' + errorText(err));
      }
    });
  }
}
