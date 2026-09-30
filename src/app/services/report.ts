import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { SalesRow, SalesSummary } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/reports/sales`;

  // period: today | thisWeek | thisMonth | thisYear | custom
  getSales(period: string, startDate = '', endDate = '') {
    const params: Record<string, string> = { period };
    if (period === 'custom' && startDate && endDate) {
      params['startDate'] = startDate;
      params['endDate'] = endDate;
    }
    return this.http.get<SalesRow[]>(this.api, { params });
  }

  getSummary(period: string, startDate = '', endDate = '') {
    return this.http.get<SalesSummary>(`${this.api}/summary`, { params: { period, startDate, endDate } });
  }
}
