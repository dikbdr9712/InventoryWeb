import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { REASON_LABELS, ReturnRequestService, ReturnRequestView, STATUS_LABELS } from '../../services/return-requests';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { ReturnDialog } from '../return-dialog/return-dialog';
import { errorText } from '../../utils/http-error';

// Staff: customers' return requests. Approve (and say how the items come back) or decline (with a reason);
// once the items are back, "Record the return" does the refund, and the request is done by itself.
@Component({
  selector: 'app-return-requests-admin',
  imports: [DatePipe, RouterLink, ReturnDialog],
  templateUrl: './return-requests-admin.html',
  styleUrl: './return-requests-admin.css'
})
export class ReturnRequestsAdmin {
  private api = inject(ReturnRequestService);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);

  view = signal<'open' | 'closed'>('open');
  requests = signal<ReturnRequestView[]>([]);
  loading = signal(true);
  busy = signal<number | null>(null);
  returnOrderId = signal<number | null>(null);

  readonly reasonLabels = REASON_LABELS;
  readonly statusLabels = STATUS_LABELS;

  constructor() {
    this.load();
  }

  show(view: 'open' | 'closed') {
    this.view.set(view);
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.list(this.view()).subscribe({
      next: list => { this.requests.set(list); this.loading.set(false); },
      error: (err: HttpErrorResponse) => { this.loading.set(false); this.toasts.error(errorText(err)); }
    });
  }

  async approve(r: ReturnRequestView) {
    const note = await this.confirm.prompt({
      title: `Approve the return of order #${r.orderId}?`,
      message: 'Tell the customer how the items come back to us. They get it by notification and email.',
      label: 'Message to the customer',
      templates: [
        'Our rider will collect it in the next days. Please keep it with its packaging.',
        'Please bring it to our shop with your order number.'
      ],
      confirmLabel: 'Approve'
    });
    if (note === null) return;
    this.answer(r, this.api.approve(r.id, note), 'Approved. Record the return when the items are back.');
  }

  async decline(r: ReturnRequestView) {
    const note = await this.confirm.prompt({
      title: `Decline the return of order #${r.orderId}?`,
      message: 'The customer sees your reason.',
      label: 'Why',
      templates: ['Opened food products cannot be returned.', 'The product was used.'],
      confirmLabel: 'Decline',
      danger: true
    });
    if (note === null) return;
    this.answer(r, this.api.decline(r.id, note), 'Declined. The customer was told.');
  }

  onReturned() {
    // the request becomes "done" on the server once the return is recorded
    this.toasts.success('Return recorded. The customer is told the refund.');
    this.load();
  }

  private answer(r: ReturnRequestView, call: ReturnType<ReturnRequestService['approve']>, done: string) {
    this.busy.set(r.id);
    call.subscribe({
      next: () => { this.busy.set(null); this.toasts.success(done); this.load(); },
      error: (err: HttpErrorResponse) => { this.busy.set(null); this.toasts.error(errorText(err)); }
    });
  }
}
