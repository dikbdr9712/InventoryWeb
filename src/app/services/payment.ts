import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { PaymentRecord, PaymentRequest } from '../models/models';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/payments`;

  create(payment: PaymentRequest) {
    return this.http.post(this.api, payment, { responseType: 'text' });
  }

  getByOrder(orderId: number) {
    return this.http.get<PaymentRecord>(`${this.api}/order/${orderId}`);
  }

  updateStatus(paymentId: number, status: string) {
    return this.http.put(`${this.api}/${paymentId}/status`, null, { params: { status }, responseType: 'text' });
  }
}
