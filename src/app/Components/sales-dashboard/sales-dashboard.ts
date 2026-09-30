import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ReportService } from '../../services/report';
import { SalesRow, SalesSummary } from '../../models/models';

@Component({
  selector: 'app-sales-dashboard',
  imports: [FormsModule, DecimalPipe, DatePipe],
  templateUrl: './sales-dashboard.html',
  styleUrl: './sales-dashboard.css'
})
export class SalesDashboard implements OnInit {
  private reportService = inject(ReportService);

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
      alert('Please choose both a start date and an end date.');
      return;
    }
    if (new Date(this.startDate) > new Date(this.endDate)) {
      alert('The start date cannot be after the end date.');
      return;
    }
    this.load('custom', this.startDate, this.endDate);
  }

  private load(period: string, start = '', end = '') {
    this.loading.set(true);

    this.reportService.getSales(period, start, end).subscribe({
      next: rows => {
        this.rows.set(rows);
        this.loading.set(false);
        this.reportService.getSummary(period, start, end).subscribe({
          next: summary => this.summary.set(summary),
          error: () => alert('Could not load the summary figures.')
        });
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        alert(`Could not load sales data. Status: ${err.status} ${err.statusText ?? ''}`);
        console.error('Sales report error:', err.error);
      }
    });
  }
}
