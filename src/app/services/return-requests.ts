import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export type ReturnReason = 'DAMAGED' | 'WRONG_ITEM' | 'CHANGED_MIND' | 'OTHER';
export type RequestStatus = 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'DONE';

export const REASON_LABELS: Record<ReturnReason, string> = {
  DAMAGED: 'It arrived damaged',
  WRONG_ITEM: 'I got the wrong item',
  CHANGED_MIND: 'I changed my mind',
  OTHER: 'Another reason'
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  REQUESTED: 'Waiting for an answer',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  DONE: 'Returned and refunded'
};

export interface ReturnRequestView {
  id: number;
  orderId: number;
  customerName?: string | null;
  customerEmail?: string | null; // staff only
  reason: ReturnReason;
  details?: string | null;
  status: RequestStatus;
  staffNote?: string | null;
  decidedBy?: string | null;     // staff only
  decidedAt?: string | null;
  createdAt: string;
  lines: { orderItemId: number; itemId: number; itemName: string; quantity: number }[];
}

export interface CustomerReturnView {
  canRequest: boolean;
  message?: string | null;
  daysLeft: number;
  lines: { orderItemId: number; itemId: number; itemName: string; quantityLeft: number }[];
  requests: ReturnRequestView[];
}

// Customers ask to return items of a delivered order; staff who take returns answer.
@Injectable({ providedIn: 'root' })
export class ReturnRequestService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  forOrder(orderId: number) {
    return this.http.get<CustomerReturnView>(`${this.api}/api/orders/${orderId}/return-request`);
  }

  ask(orderId: number, body: { reason: ReturnReason; details: string; items: { orderItemId: number; quantity: number }[] }) {
    return this.http.post<ReturnRequestView>(`${this.api}/api/orders/${orderId}/return-request`, body);
  }

  list(view: 'open' | 'closed' | 'all') {
    return this.http.get<ReturnRequestView[]>(`${this.api}/api/return-requests`, { params: { view } });
  }

  approve(id: number, note: string | null) {
    return this.http.post<ReturnRequestView>(`${this.api}/api/return-requests/${id}/approve`, { note });
  }

  decline(id: number, note: string) {
    return this.http.post<ReturnRequestView>(`${this.api}/api/return-requests/${id}/decline`, { note });
  }
}
