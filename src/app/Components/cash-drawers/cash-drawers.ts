import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { PosService } from '../../services/pos';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { ShiftReport } from '../../models/models';
import { errorText } from '../../utils/http-error';

type Filter = 'all' | 'open' | 'difference';

// Cash drawer shifts: who sold, how much cash should be in the drawer, what was counted, and any shortage.
// Managers ("Manage all cash drawers") see every cashier and can close a drawer someone forgot to close.
@Component({
  selector: 'app-cash-drawers',
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink],
  templateUrl: './cash-drawers.html',
  styleUrl: './cash-drawers.css'
})
export class CashDrawers implements OnInit {
  private pos = inject(PosService);
  private auth = inject(AuthService);
  private toasts = inject(ToastService);
  private dialog = inject(ConfirmService);

  canManage = this.auth.can('pos.shifts.manage');
  myEmail = (this.auth.email() ?? '').toLowerCase();

  shifts = signal<ShiftReport[]>([]);
  loading = signal(true);
  filter = signal<Filter>('all');
  openId = signal<number | null>(null);      // the shift shown in detail
  showHelp = signal(false);

  // closing a drawer for someone else
  closingId = signal<number | null>(null);
  counted: number | null = null;
  note = '';
  saving = signal(false);

  shown = computed(() => {
    const f = this.filter();
    return this.shifts().filter(s =>
      f === 'all' || (f === 'open' ? s.status === 'OPEN' : (s.difference ?? 0) !== 0));
  });

  totals = computed(() => {
    const list = this.shifts();
    return {
      open: list.filter(s => s.status === 'OPEN').length,
      missing: list.reduce((sum, s) => sum + Math.min(0, Number(s.difference ?? 0)), 0),
      over: list.reduce((sum, s) => sum + Math.max(0, Number(s.difference ?? 0)), 0),
      cashTaken: list.reduce((sum, s) => sum + Number(s.cashSales ?? 0), 0)
    };
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.pos.shifts().subscribe({
      next: list => {
        this.shifts.set(list);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  toggle(s: ShiftReport) {
    this.openId.update(id => (id === s.id ? null : s.id));
    this.closingId.set(null);
  }

  isMine(s: ShiftReport) {
    return s.cashierEmail.toLowerCase() === this.myEmail;
  }

  hoursOpen(s: ShiftReport): number {
    return (Date.now() - new Date(s.openedAt).getTime()) / 3_600_000;
  }

  methods(s: ShiftReport) {
    const names: Record<string, string> = { CASH: 'Cash', CARD: 'Card', UPI: 'UPI', BANK_TRANSFER: 'Bank transfer' };
    return Object.entries(s.salesByMethod ?? {}).map(([m, amount]) => ({ method: names[m] ?? m, amount }));
  }

  // ---------- closing a drawer someone forgot ----------
  startClose(s: ShiftReport) {
    this.closingId.set(s.id);
    this.counted = null;
    this.note = '';
  }

  difference(s: ShiftReport): number | null {
    return this.counted === null || String(this.counted) === '' ? null
      : Math.round((Number(this.counted) - Number(s.expectedCash)) * 100) / 100;
  }

  async close(s: ShiftReport) {
    const diff = this.difference(s);
    if (diff === null || Number(this.counted) < 0) {
      this.toasts.error('Count the cash in the drawer and enter the amount.');
      return;
    }
    if (diff !== 0 && !this.note.trim()) {
      this.toasts.error('The count does not match. Write a short note about it.');
      return;
    }
    const ok = await this.dialog.ask({
      title: 'Close ' + (s.cashierName || s.cashierEmail) + '\'s drawer?',
      message: 'Counted Nu. ' + Number(this.counted).toFixed(2) + ' against Nu. ' + Number(s.expectedCash).toFixed(2)
        + ' expected. The cashier will need to open a new drawer to sell again.',
      confirmLabel: 'Close drawer'
    });
    if (!ok) return;
    this.saving.set(true);
    this.pos.closeShift(s.id, Number(this.counted), this.note.trim()).subscribe({
      next: closed => {
        this.saving.set(false);
        this.closingId.set(null);
        this.shifts.update(list => list.map(x => (x.id === closed.id ? closed : x)));
        this.toasts.success('Drawer closed.');
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  // ---------- printing one shift's report (receipt printer size) ----------
  print(s: ShiftReport) {
    const source = document.getElementById('shift-' + s.id);
    if (!source) return;
    document.getElementById('print-root')?.remove();
    document.getElementById('print-style')?.remove();
    const root = document.createElement('div');
    root.id = 'print-root';
    root.innerHTML = '<h2 style="margin:0 0 4px;font-size:16px">DK/Phar · Cash drawer report</h2>' + source.outerHTML;
    root.querySelectorAll('.no-print').forEach(e => e.remove());
    const style = document.createElement('style');
    style.id = 'print-style';
    style.textContent = `
      #print-root { display: none; }
      @media print {
        @page { size: 80mm auto; margin: 4mm; }
        body > *:not(#print-root) { display: none !important; }
        #print-root { display: block !important; font: 12px monospace; width: 72mm; }
        #print-root dl div { display: flex; justify-content: space-between; }
        #print-root dd { margin: 0; }
      }`;
    document.body.appendChild(root);
    document.head.appendChild(style);
    const cleanup = () => {
      root.remove();
      style.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }
}
