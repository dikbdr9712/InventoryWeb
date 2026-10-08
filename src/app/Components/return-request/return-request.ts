import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CustomerReturnView, REASON_LABELS, ReturnReason, ReturnRequestService, STATUS_LABELS } from '../../services/return-requests';
import { ToastService } from '../../services/toast';
import { errorText } from '../../utils/http-error';

// On the customer's order page: ask to return items of a delivered order, and follow the answer.
// Shows nothing until the order has been delivered (or a request exists).
@Component({
  selector: 'app-return-request',
  imports: [DatePipe, FormsModule],
  templateUrl: './return-request.html',
  styleUrl: './return-request.css'
})
export class ReturnRequestPanel {
  private api = inject(ReturnRequestService);
  private toasts = inject(ToastService);

  orderId = input.required<number>();
  completed = input(false); // the order reached the customer

  view = signal<CustomerReturnView | null>(null);
  open = signal(false);
  sending = signal(false);
  quantities = signal<Record<number, number>>({});
  reason = signal<ReturnReason | ''>('');
  details = '';

  readonly reasons = Object.entries(REASON_LABELS) as [ReturnReason, string][];
  readonly statusLabels = STATUS_LABELS;
  readonly reasonLabels = REASON_LABELS;

  visible = computed(() => {
    const v = this.view();
    return !!v && (this.completed() || v.requests.length > 0);
  });
  returnable = computed(() => (this.view()?.lines ?? []).filter(l => l.quantityLeft > 0));
  chosenCount = computed(() => Object.values(this.quantities()).reduce((s, n) => s + n, 0));

  constructor() {
    effect(() => this.load(this.orderId()));
  }

  private load(orderId: number) {
    this.api.forOrder(orderId).subscribe({ next: v => this.view.set(v), error: () => this.view.set(null) });
  }

  start() {
    this.quantities.set(Object.fromEntries(this.returnable().map(l => [l.orderItemId, this.returnable().length === 1 ? 1 : 0])));
    this.reason.set('');
    this.details = '';
    this.open.set(true);
  }

  change(orderItemId: number, delta: number, max: number) {
    this.quantities.update(q => ({ ...q, [orderItemId]: Math.max(0, Math.min(max, (q[orderItemId] ?? 0) + delta)) }));
  }

  send() {
    const reason = this.reason();
    if (!this.chosenCount()) { this.toasts.error('Choose at least one product to return.'); return; }
    if (!reason) { this.toasts.error('Choose why you want to return it.'); return; }
    if (reason === 'OTHER' && !this.details.trim()) { this.toasts.error('Tell us a little about the reason.'); return; }
    const items = Object.entries(this.quantities()).filter(([, n]) => n > 0).map(([id, n]) => ({ orderItemId: Number(id), quantity: n }));
    this.sending.set(true);
    this.api.ask(this.orderId(), { reason, details: this.details.trim(), items }).subscribe({
      next: () => {
        this.sending.set(false);
        this.open.set(false);
        this.toasts.success('Your return request was sent. We will answer you soon.');
        this.load(this.orderId());
      },
      error: (err: HttpErrorResponse) => {
        this.sending.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }
}
