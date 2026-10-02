import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Order, PosSaleRequest, ShiftReport } from '../models/models';

@Injectable({ providedIn: 'root' })
export class PosService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/pos`;

  sale(request: PosSaleRequest) {
    return this.http.post<Order>(`${environment.apiUrl}/api/orders/pos/sale`, request);
  }

  history() {
    return this.http.get<Order[]>(`${this.api}/history`);
  }

  // ---------- Cash drawer shifts ----------
  // null = this cashier has no open drawer
  currentShift() {
    return this.http.get<ShiftReport>(`${this.api}/shifts/current`, { observe: 'response' })
      .pipe(map(res => (res.status === 204 ? null : res.body)));
  }

  openShift(openingFloat: number) {
    return this.http.post<ShiftReport>(`${this.api}/shifts/open`, { openingFloat });
  }

  closeShift(id: number, countedCash: number, note: string) {
    return this.http.post<ShiftReport>(`${this.api}/shifts/${id}/close`, { countedCash, note });
  }

  shifts() {
    return this.http.get<ShiftReport[]>(`${this.api}/shifts`);
  }

  shift(id: number) {
    return this.http.get<ShiftReport>(`${this.api}/shifts/${id}`);
  }
}
