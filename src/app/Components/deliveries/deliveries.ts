import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MarketplaceService } from '../../services/marketplace';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { OrderPackage, PackageStatus } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { mapLink, packageLabel, packagePill } from '../../utils/package-status';
import { sizeInfo } from '../../utils/location';

type Filter = 'action' | PackageStatus | 'all';

// Every package of every online order, for staff. Staff pack our own shop's packages here,
// and can deliver a package themselves when no rider is available.
@Component({
  selector: 'app-deliveries',
  imports: [RouterLink, DecimalPipe, DatePipe],
  templateUrl: './deliveries.html',
  styleUrl: './deliveries.css'
})
export class Deliveries implements OnInit {
  private marketplace = inject(MarketplaceService);
  auth = inject(AuthService);
  private toasts = inject(ToastService);
  private dialog = inject(ConfirmService);

  packageLabel = packageLabel;
  packagePill = packagePill;
  mapLink = mapLink;
  sizeInfo = sizeInfo;

  all = signal<OrderPackage[]>([]);
  loading = signal(true);
  busy = signal<number | null>(null);
  filter = signal<Filter>('action');
  canAct = this.auth.can('orders.fulfil');

  readonly filters: { key: Filter; label: string }[] = [
    { key: 'action', label: 'Needs us' },
    { key: 'TO_PACK', label: 'To pack' },
    { key: 'READY_FOR_PICKUP', label: 'Waiting for rider' },
    { key: 'ASSIGNED', label: 'Rider going' },
    { key: 'PICKED_UP', label: 'On the way' },
    { key: 'DELIVERED', label: 'Delivered' },
    { key: 'all', label: 'All' }
  ];

  // What staff should look at: our own packages to pack, and anything stuck waiting for a rider for over an hour
  needsUs = computed(() => this.all().filter(p =>
    (p.status === 'TO_PACK' && !p.sellerId) ||
    (p.status === 'READY_FOR_PICKUP' && p.packedAt && Date.now() - new Date(p.packedAt).getTime() > 60 * 60 * 1000)
  ));

  shown = computed(() => {
    const f = this.filter();
    if (f === 'action') return this.needsUs();
    if (f === 'all') return this.all();
    return this.all().filter(p => p.status === f);
  });

  count(f: Filter): number {
    if (f === 'action') return this.needsUs().length;
    if (f === 'all') return this.all().length;
    return this.all().filter(p => p.status === f).length;
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.marketplace.allPackages().subscribe({
      next: list => {
        this.all.set(list);
        this.loading.set(false);
        if (this.needsUs().length === 0 && this.filter() === 'action') this.filter.set('all');
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  waitingFor(p: OrderPackage): string {
    const since = p.packedAt ? new Date(p.packedAt).getTime() : 0;
    if (!since) return '';
    const minutes = Math.round((Date.now() - since) / 60000);
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  async act(p: OrderPackage, action: 'packed' | 'pickup' | 'deliver') {
    const texts = {
      packed: { title: 'Mark as packed?', message: `Package for order #${p.orderId} is ready. Riders will see the job.`, label: 'Packed' },
      pickup: { title: 'Deliver it ourselves?', message: 'Use this when one of our staff takes it. No rider is paid for it.', label: 'We are taking it' },
      deliver: { title: 'Mark as delivered?', message: `Only when the customer has the package for order #${p.orderId}. This books the earnings.`, label: 'Delivered' }
    }[action];
    if (!(await this.dialog.ask({ title: texts.title, message: texts.message, confirmLabel: texts.label }))) return;

    this.busy.set(p.id);
    this.marketplace.staffAction(p.id, action).subscribe({
      next: updated => {
        this.busy.set(null);
        this.all.update(list => list.map(x => (x.id === updated.id ? updated : x)));
        this.toasts.success('Updated.');
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }
}
