import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AdminOrder, DirectOrderRequest, Order, OrderAction, OrderItem, OrderRequest, Receipt } from '../models/models';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/orders`;

  // ---------- Customer ----------
  create(order: OrderRequest | DirectOrderRequest) {
    return this.http.post<{ orderId: number }>(this.api, order);
  }

  updateStatus(orderId: number, status: string) {
    return this.http.put(`${this.api}/${orderId}/status`, { status }, { responseType: 'text' });
  }

  getByCustomer(email: string) {
    return this.http.get<Order[]>(`${this.api}/customer/${encodeURIComponent(email)}`);
  }

  getById(orderId: number) {
    return this.http.get<Order>(`${this.api}/${orderId}`);
  }

  getItems(orderId: number) {
    return this.http.get<OrderItem[]>(`${this.api}/${orderId}/items`);
  }

  // The payment receipt of a paid order (the customer's own, or any for staff)
  receipt(orderId: number) {
    return this.http.get<Receipt>(`${this.api}/${orderId}/receipt`);
  }

  // ---------- Admin ----------
  getAllForAdmin() {
    return this.http.get<AdminOrder[]>(`${environment.apiUrl}/api/admin/orders`);
  }

  getByStatus(status: string) {
    return this.http.get<Order[]>(`${this.api}/status/${status}`);
  }

  // confirm-payment | confirm | cancel | ship | complete
  runAction(orderId: number, action: OrderAction) {
    return this.http.post(`${this.api}/${orderId}/${action}`, {}, { responseType: 'text' });
  }

  verify(orderId: number, body: { status: string | null; paymentStatus: string; note: string }) {
    return this.http.put(`${this.api}/${orderId}/verify`, body, { responseType: 'text' });
  }
}
