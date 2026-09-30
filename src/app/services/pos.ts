import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Order, PosSaleRequest } from '../models/models';

@Injectable({ providedIn: 'root' })
export class PosService {
  private http = inject(HttpClient);

  sale(request: PosSaleRequest) {
    return this.http.post<Order>(`${environment.apiUrl}/api/orders/pos/sale`, request);
  }

  history() {
    return this.http.get<Order[]>(`${environment.apiUrl}/api/pos/history`);
  }
}
