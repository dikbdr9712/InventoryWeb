import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { CustomerDetail, CustomerSummary } from '../models/models';

// The staff customer list (needs "See customers"; editing needs "Edit customer details")
@Injectable({ providedIn: 'root' })
export class CustomersService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/customers`;

  list(q = '', limit = 200) {
    return this.http.get<CustomerSummary[]>(this.api, { params: { q, limit: String(limit) } });
  }

  detail(id: number) {
    return this.http.get<CustomerDetail>(`${this.api}/${id}`);
  }

  update(id: number, body: { name: string; phone: string; email: string; address: string; notes: string }) {
    return this.http.put<CustomerDetail>(`${this.api}/${id}`, body);
  }
}
