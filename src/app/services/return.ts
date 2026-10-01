import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

// These match what the server's returns endpoints send and expect.

export interface ReturnableLine {
  orderItemId: number;
  itemId: number;
  quantitySold: number;
  quantityReturned: number;
  quantityLeft: number;
  unitRefund: number; // what the customer really paid for ONE, tax included
}

export interface ReturnableOrder {
  orderId: number;
  orderStatus: string;
  eligible: boolean;
  message: string | null; // why not, when eligible is false
  daysLeft: number;
  paidTotal: number;
  refundedSoFar: number;
  lines: ReturnableLine[];
}

export interface ReturnLineRequest {
  orderItemId: number;
  quantity: number;
  restock: boolean;
}

export interface ReturnRequest {
  reason: string;
  note: string;
  refundMethod: string;
  items: ReturnLineRequest[];
}

export interface ReturnLineView {
  orderItemId: number;
  itemId: number;
  quantity: number;
  unitRefund: number;
  restocked: boolean;
}

// One sale that has had refunds (for the Sales history list)
export interface SaleRefund {
  orderId: number;
  returnCount: number;
  refundedAmount: number;
  paidTotal: number;
  fullyReturned: boolean;
}

export interface ReturnView {
  returnId: number;
  orderId: number;
  createdAt: string;
  createdBy: string;
  reason: string;
  note: string | null;
  refundMethod: string;
  refundAmount: number;
  items: ReturnLineView[];
}

@Injectable({ providedIn: 'root' })
export class ReturnService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/orders`;

  returnable(orderId: number) {
    return this.http.get<ReturnableOrder>(`${this.api}/${orderId}/returnable`);
  }

  list(orderId: number) {
    return this.http.get<ReturnView[]>(`${this.api}/${orderId}/returns`);
  }

  // every sale that has had a refund, with the amounts
  summary() {
    return this.http.get<SaleRefund[]>(`${environment.apiUrl}/api/returns/summary`);
  }

  create(orderId: number, request: ReturnRequest) {
    return this.http.post<ReturnView>(`${this.api}/${orderId}/returns`, request);
  }
}
