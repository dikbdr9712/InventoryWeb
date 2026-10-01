import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

// What the server says about a phone number.
// found = false means "we have no earlier sales for this number".
export interface CustomerLookup {
  found: boolean;
  name?: string;
  visits?: number;
  totalSpent?: number;
  lastVisit?: string;
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private http = inject(HttpClient);

  lookup(phone: string) {
    return this.http.get<CustomerLookup>(`${environment.apiUrl}/api/customers/lookup`, { params: { phone } });
  }
}
