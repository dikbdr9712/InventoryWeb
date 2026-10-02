import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MarketplaceService } from '../../services/marketplace';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import {
  BalanceRow, DeliveryArea, DeliverySize, LedgerRow, LegalTerms, MarketplaceOverview, MarketplaceSettings, Partner, PartnerDocumentInfo, TermsType
} from '../../models/models';
import { DeliveryService } from '../../services/delivery';
import { MapPoint } from '../map-point/map-point';
import { DELIVERY_SIZES, LatLng, mapLink, point } from '../../utils/location';
import { LegalService } from '../../services/legal';
import { TermsText } from '../terms-text/terms-text';
import { errorText } from '../../utils/http-error';
import { partnerLabel, partnerPill } from '../../utils/package-status';

type Tab = 'overview' | 'people' | 'payouts' | 'terms' | 'settings';
type PeopleFilter = 'waiting' | 'SELLER' | 'RIDER' | 'all';

// Running the marketplace: who may sell or deliver, how much we charge, and paying people.
@Component({
  selector: 'app-marketplace-admin',
  imports: [FormsModule, RouterLink, DecimalPipe, DatePipe, TermsText, MapPoint],
  templateUrl: './marketplace-admin.html',
  styleUrl: './marketplace-admin.css'
})
export class MarketplaceAdmin implements OnInit {
  private marketplace = inject(MarketplaceService);
  private toasts = inject(ToastService);
  private dialog = inject(ConfirmService);
  private deliveryApi = inject(DeliveryService);

  partnerLabel = partnerLabel;
  partnerPill = partnerPill;

  tab = signal<Tab>('overview');
  overview = signal<MarketplaceOverview | null>(null);
  partners = signal<Partner[]>([]);
  balances = signal<BalanceRow[]>([]);
  busy = signal<string | null>(null);
  filter = signal<PeopleFilter>('waiting');

  waiting = computed(() => this.partners().filter(p => p.status === 'PENDING'));
  shown = computed(() => {
    const f = this.filter();
    if (f === 'waiting') return this.waiting();
    if (f === 'all') return this.partners();
    return this.partners().filter(p => p.type === f);
  });
  owed = computed(() => this.balances().filter(b => b.balanceOwed > 0));

  // commission box per seller (empty = default)
  rates: Record<number, string> = {};

  // settings form: commission, and delivery priced by size and distance
  settings = {
    defaultCommissionPercent: null as number | null,
    rates: DELIVERY_SIZES.map(s => ({ size: s.value as DeliverySize, label: s.label, vehicle: s.vehicle, baseFee: null as number | null, perKm: null as number | null })),
    includedKm: null as number | null,
    riderSharePercent: null as number | null,
    maxDistanceKm: null as number | null,
    unknownDistanceKm: null as number | null,
    shopAddress: ''
  };
  shopPoint = signal<LatLng | null>(null);
  readonly exampleKm = [2, 5, 10];

  // delivery areas customers can choose at checkout
  areas = signal<DeliveryArea[]>([]);
  areaForm = { name: '', town: 'Thimphu' };
  areaPoint = signal<LatLng | null>(null);
  editingAreaId = signal<number | null>(null);
  savingArea = signal(false);
  mapLink = mapLink;
  savedSettings = signal<MarketplaceSettings | null>(null);
  savingSettings = signal(false);

  // payouts
  payingKey = signal<string | null>(null);
  payAmount: number | null = null;
  payRef = '';
  historyKey = signal<string | null>(null);
  history = signal<LedgerRow[]>([]);

  // adjustments (money taken back or added, always with a reason)
  adjustKey = signal<string | null>(null);
  adjustAmount: number | null = null;
  adjustReason = '';
  adjustOrder: number | null = null;

  // ---------- Agreements ----------
  private legal = inject(LegalService);
  termsType = signal<TermsType>('SELLER');
  allTerms = signal<Record<string, LegalTerms[]>>({});
  termsDraft = { title: '', body: '', changeSummary: '' };
  termsPreview = signal(false);
  publishing = signal(false);
  readonly termsTypes: { value: TermsType; label: string; slug: string }[] = [
    { value: 'SELLER', label: 'Seller Agreement', slug: '/terms/seller' },
    { value: 'RIDER', label: 'Driver Agreement', slug: '/terms/driver' },
    { value: 'CUSTOMER', label: 'Customer Terms & Privacy', slug: '/terms' }
  ];
  currentTerms = computed(() => this.allTerms()[this.termsType()]?.[0] ?? null);
  termsSlug = computed(() => this.termsTypes.find(t => t.value === this.termsType())?.slug ?? '/terms');

  ngOnInit() {
    this.loadAll();
    this.marketplace.settings().subscribe({ next: s => this.applySettings(s), error: () => {} });
    this.loadAreas();
  }

  private loadAll() {
    this.marketplace.overview().subscribe({ next: o => this.overview.set(o), error: () => {} });
    this.marketplace.partners().subscribe({
      next: list => {
        this.partners.set(list);
        for (const p of list) {
          if (p.type === 'SELLER') this.rates[p.id] = p.commissionPercent == null ? '' : String(p.commissionPercent);
        }
        if (this.waiting().length === 0 && this.filter() === 'waiting') this.filter.set('all');
      },
      error: () => {}
    });
    this.marketplace.balances().subscribe({ next: rows => this.balances.set(rows), error: () => {} });
  }

  private applySettings(s: MarketplaceSettings) {
    this.savedSettings.set(s);
    this.settings = {
      defaultCommissionPercent: Number(s.defaultCommissionPercent),
      rates: DELIVERY_SIZES.map(size => {
        const r = s.rates?.find(x => x.size === size.value);
        return { size: size.value, label: size.label, vehicle: size.vehicle, baseFee: r ? Number(r.baseFee) : null, perKm: r ? Number(r.perKm) : null };
      }),
      includedKm: Number(s.includedKm),
      riderSharePercent: Number(s.riderSharePercent),
      maxDistanceKm: Number(s.maxDistanceKm),
      unknownDistanceKm: Number(s.unknownDistanceKm),
      shopAddress: s.shopAddress ?? ''
    };
    this.shopPoint.set(point(s.shopLatitude, s.shopLongitude));
  }

  documentUrl(d: PartnerDocumentInfo) {
    return this.marketplace.documentUrl(d.id);
  }

  docLabel(kind: string) {
    return kind === 'ID_CARD' ? 'CID card' : kind === 'DRIVING_LICENCE' ? 'Driving licence' : kind === 'TRADE_LICENCE' ? 'Trade licence' : kind;
  }

  // ---------- Adjustments ----------
  startAdjust(row: BalanceRow) {
    this.adjustKey.set(this.key(row));
    this.payingKey.set(null);
    this.adjustAmount = null;
    this.adjustReason = '';
    this.adjustOrder = null;
  }

  async adjust(row: BalanceRow) {
    const amount = Number(this.adjustAmount);
    if (!amount) {
      this.toasts.error('Enter the amount: minus to take money back (e.g. -250), plus to add.');
      return;
    }
    if (!this.adjustReason.trim()) {
      this.toasts.error('Write the reason. The ' + (row.partyType === 'SELLER' ? 'seller' : 'driver') + ' sees it.');
      return;
    }
    const ok = await this.dialog.ask({
      title: amount < 0 ? 'Take money back?' : 'Add money?',
      message: (amount < 0 ? 'Take Nu. ' + (-amount).toFixed(2) + ' from ' : 'Add Nu. ' + amount.toFixed(2) + ' to ') + row.name + "'s balance. Reason: " + this.adjustReason.trim(),
      confirmLabel: 'Record it',
      danger: amount < 0
    });
    if (!ok) return;
    this.busy.set(this.key(row));
    this.marketplace.adjust(row.partyType, row.partyId, amount, this.adjustReason.trim(), this.adjustOrder ? Number(this.adjustOrder) : null).subscribe({
      next: () => {
        this.busy.set(null);
        this.adjustKey.set(null);
        this.toasts.success('Recorded.');
        this.loadAll();
        if (this.historyKey() === this.key(row)) this.showHistory(row, true);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  // ---------- Agreements ----------
  openTerms() {
    this.tab.set('terms');
    this.legal.all().subscribe({
      next: all => {
        this.allTerms.set(all);
        this.fillTermsDraft();
      },
      error: (err: HttpErrorResponse) => this.toasts.error(errorText(err))
    });
  }

  chooseTerms(type: TermsType) {
    this.termsType.set(type);
    this.termsPreview.set(false);
    this.fillTermsDraft();
  }

  private fillTermsDraft() {
    const cur = this.currentTerms();
    this.termsDraft = { title: cur?.title ?? '', body: cur?.body ?? '', changeSummary: '' };
  }

  termsChanged() {
    const cur = this.currentTerms();
    return !!cur && (this.termsDraft.body.trim() !== cur.body.trim() || this.termsDraft.title.trim() !== cur.title.trim());
  }

  async publishTerms() {
    const cur = this.currentTerms();
    if (!cur) return;
    if (!this.termsChanged()) {
      this.toasts.error('Nothing changed yet.');
      return;
    }
    if (!this.termsDraft.changeSummary.trim()) {
      this.toasts.error('Write a short summary of what changed. People who must accept again see it.');
      return;
    }
    const who = this.termsType() === 'SELLER' ? 'Every seller' : this.termsType() === 'RIDER' ? 'Every driver' : 'New customers';
    const ok = await this.dialog.ask({
      title: 'Publish version ' + (cur.version + 1) + '?',
      message: who + (this.termsType() === 'CUSTOMER' ? ' will accept this version when they sign up.' :
        ' must accept this version before they can use their dashboard again. Version ' + cur.version + ' stays on record.'),
      confirmLabel: 'Publish',
      danger: true
    });
    if (!ok) return;
    this.publishing.set(true);
    this.legal.publish(this.termsType(), {
      title: this.termsDraft.title.trim(), body: this.termsDraft.body, changeSummary: this.termsDraft.changeSummary.trim()
    }).subscribe({
      next: saved => {
        this.publishing.set(false);
        this.toasts.success('Version ' + saved.version + ' published.');
        this.openTerms();
      },
      error: (err: HttpErrorResponse) => {
        this.publishing.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  key(p: { partyType?: string; type?: string; partyId?: number; id?: number }) {
    return `${p.partyType ?? p.type}-${p.partyId ?? p.id}`;
  }

  // ---------- Approvals ----------
  async approve(p: Partner) {
    const what = p.type === 'SELLER' ? `${p.shopName} can sell on the site` : `${p.name} can take delivery jobs`;
    if (!(await this.dialog.ask({ title: `Approve ${p.type === 'SELLER' ? 'seller' : 'rider'}?`, message: `${what}.`, confirmLabel: 'Approve' }))) return;
    this.setStatus(p, 'APPROVED', null);
  }

  async refuse(p: Partner, status: 'REJECTED' | 'SUSPENDED') {
    const reason = await this.dialog.prompt({
      title: status === 'REJECTED' ? 'Reject application' : 'Suspend account',
      message: status === 'REJECTED'
        ? `${p.name} will see this reason and can fix the application.`
        : `${p.name} will not be able to ${p.type === 'SELLER' ? 'sell (their products are hidden)' : 'take jobs'} until you approve again.`,
      label: 'Reason (the person sees this)',
      templates: status === 'REJECTED'
        ? ['The bank details do not match the name.', 'We could not reach you on the phone number given.', 'Please give a clearer pickup address.']
        : ['Several late or missed deliveries.', 'Customer complaints about product quality.'],
      confirmLabel: status === 'REJECTED' ? 'Reject' : 'Suspend',
      danger: true
    });
    if (reason === null) return;
    this.setStatus(p, status, reason);
  }

  private setStatus(p: Partner, status: 'APPROVED' | 'REJECTED' | 'SUSPENDED', note: string | null) {
    this.busy.set(this.key(p));
    this.marketplace.setStatus(p, status, note).subscribe({
      next: updated => {
        this.busy.set(null);
        this.partners.update(list => list.map(x => (x.type === updated.type && x.id === updated.id ? updated : x)));
        this.toasts.success(status === 'APPROVED' ? 'Approved.' : status === 'REJECTED' ? 'Application rejected.' : 'Account suspended.');
        this.marketplace.overview().subscribe({ next: o => this.overview.set(o), error: () => {} });
        this.marketplace.balances().subscribe({ next: rows => this.balances.set(rows), error: () => {} });
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  saveRate(p: Partner) {
    const text = (this.rates[p.id] ?? '').trim();
    const rate = text === '' ? null : Number(text);
    if (rate !== null && !(rate >= 0 && rate <= 50)) {
      this.toasts.error('Commission must be between 0 and 50 percent.');
      return;
    }
    this.busy.set(this.key(p));
    this.marketplace.setCommission(p.id, rate).subscribe({
      next: updated => {
        this.busy.set(null);
        this.partners.update(list => list.map(x => (x.type === 'SELLER' && x.id === updated.id ? updated : x)));
        this.toasts.success(rate === null ? 'This seller now uses the default rate.' : `Commission set to ${rate}% for new orders.`);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  // ---------- Payouts ----------
  startPay(row: BalanceRow) {
    this.adjustKey.set(null);
    this.payingKey.set(this.key(row));
    this.payAmount = row.balanceOwed;
    this.payRef = '';
  }

  async pay(row: BalanceRow) {
    const amount = Number(this.payAmount);
    if (!(amount > 0) || amount > row.balanceOwed) {
      this.toasts.error(`Enter an amount between 0 and Nu. ${row.balanceOwed}.`);
      return;
    }
    if (!this.payRef.trim()) {
      this.toasts.error('Enter the bank journal number of the transfer.');
      return;
    }
    const ok = await this.dialog.ask({
      title: 'Record this payout?',
      message: `Nu. ${amount.toFixed(2)} to ${row.name} (${row.bankName}, ${row.bankAccountNumber}). Only record it after the money has been sent.`,
      confirmLabel: 'Record payout'
    });
    if (!ok) return;
    this.busy.set(this.key(row));
    this.marketplace.payout(row.partyType, row.partyId, amount, this.payRef.trim()).subscribe({
      next: () => {
        this.busy.set(null);
        this.payingKey.set(null);
        this.toasts.success('Payout recorded.');
        this.loadAll();
        if (this.historyKey() === this.key(row)) this.showHistory(row, true);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  showHistory(row: BalanceRow, force = false) {
    const k = this.key(row);
    if (this.historyKey() === k && !force) {
      this.historyKey.set(null);
      return;
    }
    this.historyKey.set(k);
    this.history.set([]);
    this.marketplace.ledger(row.partyType, row.partyId).subscribe({ next: rows => this.history.set(rows), error: () => {} });
  }

  // ---------- Settings ----------
  // The same sum the server does (the server's price is what counts): base + km beyond the included km x per km,
  // rounded up to the next Nu. 5; the rider gets their share, rounded to whole Nu.
  deliveryExample(rate: { baseFee: number | null; perKm: number | null }, km: number) {
    const included = Number(this.settings.includedKm) || 0;
    const raw = (Number(rate.baseFee) || 0) + Math.max(0, km - included) * (Number(rate.perKm) || 0);
    const fee = Math.ceil(raw / 5) * 5;
    const rider = Math.round(fee * (Number(this.settings.riderSharePercent) || 0) / 100);
    return { fee, rider, keep: fee - rider };
  }

  commissionExample() {
    const sale = 1000;
    const commission = Math.round(sale * (Number(this.settings.defaultCommissionPercent) || 0)) / 100;
    return { sale, commission, seller: sale - commission };
  }

  saveSettings() {
    const s = this.settings;
    const rate = Number(s.defaultCommissionPercent);
    const bad = (v: number | null, min: number, max: number) => v == null || String(v) === '' || !(Number(v) >= min && Number(v) <= max);
    if (bad(s.defaultCommissionPercent, 0, 50)) { this.toasts.error('Commission must be between 0 and 50%.'); return; }
    if (s.rates.some(r => bad(r.baseFee, 0, 100000) || bad(r.perKm, 0, 10000))) { this.toasts.error('Fill in every base fee and price per km (0 or more).'); return; }
    if (bad(s.includedKm, 0, 50)) { this.toasts.error('Km included in the base fee: 0 to 50.'); return; }
    if (bad(s.riderSharePercent, 1, 100)) { this.toasts.error("The rider's share must be between 1 and 100%."); return; }
    if (bad(s.maxDistanceKm, 1, 500)) { this.toasts.error('The longest delivery must be between 1 and 500 km.'); return; }
    if (bad(s.unknownDistanceKm, 0, 100)) { this.toasts.error('The distance used without a location: 0 to 100 km.'); return; }

    const shop = this.shopPoint();
    this.savingSettings.set(true);
    this.marketplace.saveSettings({
      defaultCommissionPercent: rate,
      rates: s.rates.map(r => ({ size: r.size, baseFee: Number(r.baseFee), perKm: Number(r.perKm) })),
      includedKm: Number(s.includedKm),
      riderSharePercent: Number(s.riderSharePercent),
      maxDistanceKm: Number(s.maxDistanceKm),
      unknownDistanceKm: Number(s.unknownDistanceKm),
      shopAddress: s.shopAddress.trim() || null,
      shopLatitude: shop?.latitude ?? null,
      shopLongitude: shop?.longitude ?? null
    }).subscribe({
      next: saved => {
        this.savingSettings.set(false);
        this.applySettings(saved);
        this.toasts.success('Saved. New orders use these numbers.');
      },
      error: (err: HttpErrorResponse) => {
        this.savingSettings.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  // ---------- Delivery areas ----------
  private loadAreas() {
    this.deliveryApi.allAreas().subscribe({ next: list => this.areas.set(list), error: () => {} });
  }

  editArea(a: DeliveryArea) {
    this.editingAreaId.set(a.id);
    this.areaForm = { name: a.name, town: a.town };
    this.areaPoint.set(point(a.latitude, a.longitude));
  }

  cancelArea() {
    this.editingAreaId.set(null);
    this.areaForm = { name: '', town: this.areaForm.town };
    this.areaPoint.set(null);
  }

  saveArea() {
    const p = this.areaPoint();
    if (!this.areaForm.name.trim() || !this.areaForm.town.trim()) { this.toasts.error('Enter the area and the town.'); return; }
    if (!p) { this.toasts.error('Set the area on the map: use your location there, or paste it from Google Maps.'); return; }
    const id = this.editingAreaId() ?? undefined;
    const current = id ? this.areas().find(a => a.id === id) : undefined;
    this.savingArea.set(true);
    this.deliveryApi.saveArea({ name: this.areaForm.name.trim(), town: this.areaForm.town.trim(), latitude: p.latitude, longitude: p.longitude, active: current?.active ?? true }, id)
      .subscribe({
        next: () => {
          this.savingArea.set(false);
          this.toasts.success(id ? 'Area updated.' : 'Area added. Customers can choose it at checkout.');
          this.cancelArea();
          this.loadAreas();
        },
        error: (err: HttpErrorResponse) => {
          this.savingArea.set(false);
          this.toasts.error(errorText(err));
        }
      });
  }

  toggleArea(a: DeliveryArea) {
    this.deliveryApi.saveArea({ name: a.name, town: a.town, latitude: a.latitude, longitude: a.longitude, active: !a.active }, a.id).subscribe({
      next: () => this.loadAreas(),
      error: (err: HttpErrorResponse) => this.toasts.error(errorText(err))
    });
  }

  async removeArea(a: DeliveryArea) {
    const ok = await this.dialog.ask({
      title: 'Remove ' + a.name + '?',
      message: 'Customers will not see it any more. Orders already placed keep their location.',
      confirmLabel: 'Remove',
      danger: true
    });
    if (!ok) return;
    this.deliveryApi.deleteArea(a.id).subscribe({
      next: () => { this.toasts.success('Area removed.'); this.loadAreas(); },
      error: (err: HttpErrorResponse) => this.toasts.error(errorText(err))
    });
  }
}
