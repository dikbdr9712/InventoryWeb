import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MarketplaceService } from '../../services/marketplace';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { LedgerRow, OrderPackage, PartnerHome } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { mapLink, packageLabel, packagePill } from '../../utils/package-status';
import { TermsGate } from '../terms-gate/terms-gate';
import { directionsLink, mapLink as pointLink, point, sizeInfo } from '../../utils/location';

type Tab = 'jobs' | 'mine' | 'money';

// A rider's day: take a job, collect it, deliver it with the customer's code, and see what they earned.
@Component({
  selector: 'app-rider-hub',
  imports: [FormsModule, RouterLink, DecimalPipe, DatePipe, TermsGate],
  templateUrl: './rider-hub.html',
  styleUrl: './rider-hub.css'
})
export class RiderHub implements OnInit, OnDestroy {
  private marketplace = inject(MarketplaceService);
  private auth = inject(AuthService);

  // What this driver account may do (ticked in People & access). The server checks the same rights.
  may = {
    jobs: this.auth.can('rider.jobs'),
    earnings: this.auth.can('rider.earnings')
  };
  private toasts = inject(ToastService);
  private dialog = inject(ConfirmService);

  packageLabel = packageLabel;
  packagePill = packagePill;
  mapLink = mapLink;
  sizeInfo = sizeInfo;

  // A place on the map: the exact point when we have it, otherwise a search for the address
  placeLink(latitude: number | null | undefined, longitude: number | null | undefined, address?: string) {
    return pointLink(latitude, longitude) ?? mapLink(address ?? '');
  }

  // Turn-by-turn directions from where the phone is now: to the shop first, then to the customer
  directions(job: OrderPackage) {
    const target = job.status === 'ASSIGNED'
      ? point(job.pickupLatitude, job.pickupLongitude)
      : point(job.dropLatitude, job.dropLongitude);
    const address = job.status === 'ASSIGNED' ? job.pickupAddress : job.dropAddress;
    return directionsLink(target) ?? mapLink(address ?? '');
  }

  tab = signal<Tab>('jobs');
  home = signal<PartnerHome | null>(null);
  loadError = signal('');
  termsRequired = signal(false); // a new Driver Agreement must be accepted first

  // ---------- Driving licence ----------
  // days until the licence runs out (negative = expired); null = no licence needed or not known
  licenceDaysLeft = computed(() => {
    const expiry = this.home()?.profile.verification?.licenseExpiry;
    if (!expiry || ['Bicycle', 'On foot'].includes(this.home()?.profile.vehicleType ?? '')) return null;
    const ms = new Date(expiry + 'T23:59:59').getTime() - Date.now();
    return Math.floor(ms / 86_400_000);
  });
  showRenew = signal(false);
  renewDate = '';
  renewFile: File | null = null;
  renewing = signal(false);
  readonly today = new Date().toISOString().slice(0, 10);
  jobs = signal<OrderPackage[]>([]);
  mine = signal<OrderPackage[]>([]);
  ledger = signal<LedgerRow[]>([]);
  busy = signal<number | null>(null);
  codes: Record<number, string> = {};
  refreshedAt = signal<Date | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  active = computed(() => this.mine().filter(p => p.status === 'ASSIGNED' || p.status === 'PICKED_UP'));
  finished = computed(() => this.mine().filter(p => p.status === 'DELIVERED' || p.status === 'CANCELLED'));

  ngOnInit() {
    this.marketplace.riderHome().subscribe({
      next: home => this.home.set(home),
      error: (err: HttpErrorResponse) => {
        if (err.status === 428) this.termsRequired.set(true);
        else this.loadError.set(errorText(err));
      }
    });
    if (!this.may.jobs) this.tab.set('money');
    if (this.may.jobs) {
      this.reload();
      // new jobs appear without pressing refresh (every 30 seconds while the page is open)
      this.timer = setInterval(() => this.loadJobs(), 30_000);
    }
    if (this.may.earnings) this.marketplace.riderLedger().subscribe({ next: rows => this.ledger.set(rows), error: () => {} });
  }

  afterTerms() {
    this.termsRequired.set(false);
    this.loadError.set('');
    if (this.timer) clearInterval(this.timer);
    this.ngOnInit();
  }

  pickRenewFile(input: HTMLInputElement) {
    const file = input.files?.[0] ?? null;
    if (file && (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      this.toasts.error('Choose a photo (JPG or PNG) or a PDF, up to 5 MB.');
      input.value = '';
      return;
    }
    this.renewFile = file;
  }

  renewLicence() {
    if (!this.renewDate || this.renewDate <= this.today) {
      this.toasts.error('Enter the new expiry date (a date in the future).');
      return;
    }
    if (!this.renewFile) {
      this.toasts.error('Add a photo or scan of the renewed licence.');
      return;
    }
    this.renewing.set(true);
    this.marketplace.renewLicence(this.renewDate, this.renewFile).subscribe({
      next: profile => {
        this.renewing.set(false);
        this.showRenew.set(false);
        const h = this.home();
        if (h) this.home.set({ ...h, profile });
        this.toasts.success('Thank you. Your licence is updated.');
      },
      error: (err: HttpErrorResponse) => {
        this.renewing.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  reload() {
    this.loadJobs();
    this.marketplace.myJobs().subscribe({
      next: list => {
        this.mine.set(list);
        if (list.some(p => p.status === 'ASSIGNED' || p.status === 'PICKED_UP') && this.tab() === 'jobs' && !this.refreshedAt()) {
          this.tab.set('mine'); // on opening the page, show the deliveries in progress first
        }
      },
      error: () => {}
    });
  }

  private loadJobs() {
    this.marketplace.openJobs().subscribe({
      next: list => {
        this.jobs.set(list);
        this.refreshedAt.set(new Date());
      },
      error: () => {}
    });
  }

  private refreshHome() {
    this.marketplace.riderHome().subscribe({ next: home => this.home.set(home), error: () => {} });
  }

  private replace(updated: OrderPackage) {
    this.mine.update(list => (list.some(p => p.id === updated.id) ? list.map(p => (p.id === updated.id ? updated : p)) : [updated, ...list]));
  }

  async accept(job: OrderPackage) {
    const ok = await this.dialog.ask({
      title: 'Take this job?',
      message: `Collect from ${job.sellerName} (${job.pickupTown || job.pickupAddress}) and deliver to ${job.dropAddress}. You earn Nu. ${job.riderPay}.`,
      confirmLabel: 'Take the job'
    });
    if (!ok) return;
    this.busy.set(job.id);
    this.marketplace.riderAction(job.id, 'accept').subscribe({
      next: updated => {
        this.busy.set(null);
        this.jobs.update(list => list.filter(j => j.id !== job.id));
        this.replace(updated);
        this.tab.set('mine');
        this.toasts.success('The job is yours. Go to the shop to collect it.');
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
        this.loadJobs();
      }
    });
  }

  async release(job: OrderPackage) {
    const ok = await this.dialog.ask({
      title: 'Give this job back?',
      message: 'Another rider will be able to take it.',
      confirmLabel: 'Give it back',
      danger: true
    });
    if (!ok) return;
    this.run(job, this.marketplace.riderAction(job.id, 'release'), 'Job given back.', true);
  }

  pickUp(job: OrderPackage) {
    this.run(job, this.marketplace.riderAction(job.id, 'pickup'), 'Picked up. Now deliver it to the customer.');
  }

  deliver(job: OrderPackage) {
    const code = (this.codes[job.id] ?? '').trim();
    if (!/^[0-9]{4}$/.test(code)) {
      this.toasts.error('Ask the customer for the 4-digit code on their order page.');
      return;
    }
    this.run(job, this.marketplace.riderDeliver(job.id, code), `Delivered! Nu. ${job.riderPay} added to your earnings.`, false, true);
  }

  private run(job: OrderPackage, request: ReturnType<MarketplaceService['riderAction']>, message: string, removeFromMine = false, money = false) {
    this.busy.set(job.id);
    request.subscribe({
      next: updated => {
        this.busy.set(null);
        if (removeFromMine) {
          this.mine.update(list => list.filter(p => p.id !== job.id));
          this.loadJobs();
        } else {
          this.replace(updated);
        }
        this.toasts.success(message);
        if (money && this.may.earnings) {
          this.refreshHome();
          this.marketplace.riderLedger().subscribe({ next: rows => this.ledger.set(rows), error: () => {} });
        }
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  ledgerLabel(row: LedgerRow): string {
    switch (row.entryType) {
      case 'DELIVERY': return `Delivery, order #${row.orderId}`;
      case 'PAYOUT': return 'Paid to your bank';
      default: return 'Adjustment';
    }
  }
}
