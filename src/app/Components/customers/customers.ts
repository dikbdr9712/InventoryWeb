import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { CustomersService } from '../../services/customers';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { CustomerDetail, CustomerSummary } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { orderLabel, orderPill } from '../../utils/order-status';

// Everyone who buys from us, online and at the counter, with their history.
@Component({
  selector: 'app-customers',
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe],
  templateUrl: './customers.html',
  styleUrl: './customers.css'
})
export class Customers implements OnInit {
  private service = inject(CustomersService);
  private auth = inject(AuthService);
  private toasts = inject(ToastService);

  orderLabel = orderLabel;
  orderPill = orderPill;
  canEdit = this.auth.can('customers.manage');

  query = '';
  list = signal<CustomerSummary[]>([]);

  // filter and sort (on the loaded list)
  kind = signal<'all' | 'account' | 'counter'>('all');
  sortBy = signal<'recent' | 'spent' | 'orders'>('recent');

  shown = computed(() => {
    const k = this.kind();
    const rows = this.list().filter(c => k === 'all' || (k === 'account' ? c.hasAccount : !c.hasAccount));
    const by = this.sortBy();
    return [...rows].sort((a, b) =>
      by === 'spent' ? Number(b.totalSpent) - Number(a.totalSpent)
        : by === 'orders' ? b.visits - a.visits
        : (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''));
  });

  totals = computed(() => {
    const rows = this.list();
    return {
      customers: rows.length,
      withAccount: rows.filter(c => c.hasAccount).length,
      counterOnly: rows.filter(c => !c.hasAccount).length,
      spent: rows.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0)
    };
  });
  loading = signal(true);
  selected = signal<CustomerDetail | null>(null);
  editing = signal(false);
  saving = signal(false);
  form = { name: '', phone: '', email: '', address: '', notes: '' };
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.search();
  }

  onQuery() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.search(), 300); // wait until typing stops
  }

  search() {
    this.loading.set(true);
    this.service.list(this.query.trim()).subscribe({
      next: rows => {
        this.list.set(rows);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  open(c: CustomerSummary) {
    this.editing.set(false);
    this.service.detail(c.id).subscribe({
      next: d => {
        this.selected.set(d);
        setTimeout(() => document.querySelector('.detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      },
      error: (err: HttpErrorResponse) => this.toasts.error(errorText(err))
    });
  }

  startEdit(d: CustomerDetail) {
    this.form = {
      name: d.customer.name ?? '', phone: d.customer.phone ?? '', email: d.customer.email ?? '',
      address: d.customer.address ?? '', notes: d.notes ?? ''
    };
    this.editing.set(true);
  }

  save(d: CustomerDetail) {
    if (!this.form.name.trim()) {
      this.toasts.error('Enter the customer\'s name.');
      return;
    }
    if (this.form.phone.trim() && !/^[0-9]{8}$/.test(this.form.phone.trim())) {
      this.toasts.error('Enter an 8-digit phone number, or leave it empty.');
      return;
    }
    this.saving.set(true);
    this.service.update(d.customer.id, this.form).subscribe({
      next: updated => {
        this.saving.set(false);
        this.editing.set(false);
        this.selected.set(updated);
        this.list.update(rows => rows.map(r => (r.id === updated.customer.id ? updated.customer : r)));
        this.toasts.success('Saved.');
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  initials(name?: string | null) {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? ((parts[0][0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() : '?';
  }

  sourceLabel(source?: string | null) {
    return source === 'POS' ? 'Counter' : source === 'SIGNUP' ? 'Signed up' : source === 'ONLINE' ? 'Online' : '-';
  }
}
