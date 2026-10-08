import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Coupon, CouponForm, CouponService } from '../../services/coupons';
import { ItemService } from '../../services/item';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { Item } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { dealEnds } from '../../utils/deals';

interface CouponFormModel {
  code: string; description: string; kind: 'PERCENT' | 'AMOUNT'; value: number | null; minOrder: number | null;
  maxDiscount: number | null; startsAt: string; endsAt: string; usageLimit: number | null; perCustomerLimit: number | null; active: boolean;
}

// Staff with "Run offers": coupon codes, and what is on the home page as a deal or featured.
@Component({
  selector: 'app-offers-admin',
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink],
  templateUrl: './offers-admin.html',
  styleUrl: './offers-admin.css'
})
export class OffersAdmin {
  private api = inject(CouponService);
  private itemService = inject(ItemService);
  private toasts = inject(ToastService);
  private confirm = inject(ConfirmService);

  coupons = signal<Coupon[]>([]);
  loading = signal(true);
  editing = signal<number | 'new' | null>(null);
  saving = signal(false);
  form: CouponFormModel = this.empty();
  private catalog = signal<Item[]>([]);
  readonly dealEnds = dealEnds;

  onHome = computed(() => this.catalog().filter(i => i.highlight === 'DEAL' || i.highlight === 'FEATURED')
    .sort((a, b) => (a.highlight === b.highlight ? 0 : a.highlight === 'DEAL' ? -1 : 1)));

  constructor() {
    this.load();
    this.itemService.getAll().subscribe({ next: list => this.catalog.set(list), error: () => {} });
  }

  load() {
    this.api.list().subscribe({
      next: list => { this.coupons.set(list); this.loading.set(false); },
      error: (err: HttpErrorResponse) => { this.loading.set(false); this.toasts.error(errorText(err)); }
    });
  }

  add() {
    this.form = this.empty();
    this.editing.set('new');
  }

  edit(c: Coupon) {
    this.form = {
      code: c.code, description: c.description ?? '', kind: c.kind, value: c.value, minOrder: c.minOrder,
      maxDiscount: c.maxDiscount ?? null, startsAt: local(c.startsAt), endsAt: local(c.endsAt), usageLimit: c.usageLimit ?? null,
      perCustomerLimit: c.perCustomerLimit, active: c.active
    };
    this.editing.set(c.id);
  }

  save() {
    const id = this.editing();
    if (id === null) return;
    const f = this.form;
    const body: CouponForm = {
      code: f.code.trim().toUpperCase(), description: f.description.trim() || null, kind: f.kind, value: Number(f.value),
      minOrder: Number(f.minOrder) || 0, maxDiscount: f.kind === 'PERCENT' && f.maxDiscount ? Number(f.maxDiscount) : null,
      startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null, endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
      usageLimit: f.usageLimit ? Number(f.usageLimit) : null, perCustomerLimit: Number(f.perCustomerLimit) || 1, active: f.active
    };
    this.saving.set(true);
    (id === 'new' ? this.api.create(body) : this.api.update(id, body)).subscribe({
      next: c => {
        this.saving.set(false);
        this.editing.set(null);
        this.toasts.success(`${c.code} saved.`);
        this.load();
      },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.toasts.error(errorText(err)); }
    });
  }

  toggle(c: Coupon) {
    const body: CouponForm = { ...c, active: !c.active };
    this.api.update(c.id, body).subscribe({
      next: () => { this.toasts.success(c.active ? `${c.code} is switched off.` : `${c.code} is on again.`); this.load(); },
      error: (err: HttpErrorResponse) => this.toasts.error(errorText(err))
    });
  }

  async remove(c: Coupon) {
    if (!await this.confirm.ask({ title: `Delete ${c.code}?`, message: 'Customers can no longer use it.', confirmLabel: 'Delete', danger: true })) return;
    this.api.remove(c.id).subscribe({
      next: () => { this.toasts.success(`${c.code} deleted.`); this.load(); },
      error: (err: HttpErrorResponse) => this.toasts.error(errorText(err))
    });
  }

  // "10% off (at most Nu. 50)" / "Nu. 100 off"
  what(c: Coupon): string {
    return c.kind === 'PERCENT'
      ? `${Number(c.value)}% off` + (c.maxDiscount ? ` (at most Nu. ${Number(c.maxDiscount)})` : '')
      : `Nu. ${Number(c.value)} off`;
  }

  state(c: Coupon): string {
    const now = Date.now();
    if (!c.active) return 'Off';
    if (c.startsAt && new Date(c.startsAt).getTime() > now) return 'Starts later';
    if (c.endsAt && new Date(c.endsAt).getTime() <= now) return 'Ended';
    if (c.usageLimit && c.uses >= c.usageLimit) return 'Used up';
    return 'On';
  }

  private empty(): CouponFormModel {
    return { code: '', description: '', kind: 'PERCENT', value: 10, minOrder: 0, maxDiscount: null, startsAt: '', endsAt: '',
      usageLimit: null, perCustomerLimit: 1, active: true };
  }
}

// an ISO time as the value of a datetime-local box (local time)
function local(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
