import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export type StockView = 'shelf' | 'expiring' | 'expired';

export interface StockBatch {
  id: number;
  itemId: number;
  itemName: string;
  sku?: string;
  batchNo?: string | null;
  expiryDate?: string | null;   // yyyy-mm-dd
  daysLeft?: number | null;     // negative = already expired
  unitCost: number;
  quantityReceived: number;
  quantityLeft: number;
  value: number;                // quantityLeft x unitCost
  status: 'ACTIVE' | 'EXPIRED' | 'WRITTEN_OFF';
  source: 'PURCHASE' | 'OPENING' | 'ADJUSTMENT' | 'RETURN' | 'SELLER';
  supplier?: string | null;
  receivedAt: string;
  receivedBy?: string | null;
  note?: string | null;
}

export interface StockSummary {
  units: number;
  stockValue: number;
  batchesOnShelf: number;
  expiringBatches: number;
  expiringUnits: number;
  expiringValue: number;
  expiringWithinDays: number;
  lostThisMonthUnits: number;
  lostThisMonthValue: number;
}

export interface ProfitReport {
  from: string;
  to: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPercent: number;
  unitsSold: number;
  returnedRevenue: number;
  returnedCost: number;
  stockLosses: number;
  netProfit: number;
  unitsWithoutCost: number;
}

// Stock by batch: what is on the shelf, what expires, write-offs, counts and profit.
@Injectable({ providedIn: 'root' })
export class StockService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/stock`;

  summary(days: number) {
    return this.http.get<StockSummary>(`${this.api}/summary`, { params: { days } });
  }

  batches(view: StockView, days: number) {
    return this.http.get<StockBatch[]>(`${this.api}/batches`, { params: { view, days } });
  }

  batchesOf(itemId: number) {
    return this.http.get<StockBatch[]>(`${this.api}/items/${itemId}/batches`);
  }

  change(id: number, batchNo: string | null, expiryDate: string | null) {
    return this.http.put<StockBatch>(`${this.api}/batches/${id}`, { batchNo, expiryDate });
  }

  writeOff(id: number, quantity: number, reason: string) {
    return this.http.post<StockBatch>(`${this.api}/batches/${id}/write-off`, { quantity, reason });
  }

  count(itemId: number, quantity: number, note: string | null) {
    return this.http.post<StockBatch[]>(`${this.api}/items/${itemId}/count`, { quantity, note });
  }

  profit(from: string, to: string) {
    return this.http.get<ProfitReport>(`${this.api}/profit`, { params: { from, to } });
  }
}
