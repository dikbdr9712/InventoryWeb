import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ReportService } from '../../services/report';
import { ToastService } from '../../services/toast';
import { errorText } from '../../utils/http-error';
import { ProfitReport, StockService } from '../../services/stock';
import { SalesRow, SalesSummary } from '../../models/models';

@Component({
  selector: 'app-sales-dashboard',
  imports: [FormsModule, DecimalPipe, DatePipe],
  templateUrl: './sales-dashboard.html',
  styleUrl: './sales-dashboard.css'
})
export class SalesDashboard implements OnInit {
  private reportService = inject(ReportService);
  private toasts = inject(ToastService);
  private stock = inject(StockService);

  // profit on our own products: what each sold unit really cost (batch by batch)
  profit = signal<ProfitReport | null>(null);

  periods = [
    { value: 'today', label: 'Today' },
    { value: 'thisWeek', label: 'This week' },
    { value: 'thisMonth', label: 'This month' },
    { value: 'thisYear', label: 'This year' },
    { value: 'custom', label: 'Custom range' }
  ];

  period = signal('today');
  startDate = '';
  endDate = '';

  rows = signal<SalesRow[]>([]);
  summary = signal<SalesSummary | null>(null);
  loading = signal(true);

  ngOnInit() {
    this.load('today');
  }

  // the period as two days (yyyy-mm-dd); a week starts on Monday
  private range(period: string, start: string, end: string): [string, string] {
    const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    switch (period) {
      case 'thisWeek': {
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        return [day(monday), day(today)];
      }
      case 'thisMonth': return [day(new Date(today.getFullYear(), today.getMonth(), 1)), day(today)];
      case 'thisYear': return [day(new Date(today.getFullYear(), 0, 1)), day(today)];
      case 'custom': return [start, end];
      default: return [day(today), day(today)];
    }
  }

  periodLabel() {
    return this.periods.find(p => p.value === this.period())?.label ?? '';
  }

  onPeriodChange(period: string) {
    this.period.set(period);
    if (period === 'custom') {
      this.startDate = '';
      this.endDate = '';
    } else {
      this.load(period);
    }
  }

  apply() {
    if (this.period() !== 'custom') {
      this.load(this.period());
      return;
    }
    if (!this.startDate || !this.endDate) {
      this.toasts.error('Please choose both a start date and an end date.');
      return;
    }
    if (new Date(this.startDate) > new Date(this.endDate)) {
      this.toasts.error('The start date cannot be after the end date.');
      return;
    }
    this.load('custom', this.startDate, this.endDate);
  }

  private load(period: string, start = '', end = '') {
    this.loading.set(true);
    const [from, to] = this.range(period, start, end);
    this.profit.set(null);
    this.stock.profit(from, to).subscribe({ next: p => this.profit.set(p), error: () => this.profit.set(null) });

    this.reportService.getSales(period, start, end).subscribe({
      next: rows => {
        this.rows.set(rows);
        this.loading.set(false);
        this.reportService.getSummary(period, start, end).subscribe({
          next: summary => this.summary.set(summary),
          error: (err: HttpErrorResponse) => {
            if (err.status !== 401) this.toasts.error('Could not load the summary figures: ' + errorText(err));
          }
        });
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // 401 = the sign-in ended: the app already goes to the sign-in page, no need for a second message
        if (err.status !== 401) this.toasts.error('Could not load the sales: ' + errorText(err));
        console.error('Sales report error:', err.error);
      }
    });
  }
}
