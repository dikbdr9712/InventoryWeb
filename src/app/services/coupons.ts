import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface CouponQuote { couponId: number; code: string; description?: string | null; discount: number; }

export interface Coupon {
  id: number;
  code: string;
  description?: string | null;
  kind: 'PERCENT' | 'AMOUNT';
  value: number;
  minOrder: number;
  maxDiscount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
  perCustomerLimit: number;
  active: boolean;
  uses: number;
  createdAt: string;
}

export type CouponForm = Omit<Coupon, 'id' | 'uses' | 'createdAt'>;

// Coupon codes: customers check one against their cart; staff with "Run offers" make and manage them.
@Injectable({ providedIn: 'root' })
export class CouponService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/coupons`;

  check(code: string, items: { itemId: number; quantity: number }[]) {
    return this.http.post<CouponQuote>(`${this.api}/check`, { code, items });
  }

  list() {
    return this.http.get<Coupon[]>(`${this.api}/admin`);
  }

  create(form: CouponForm) {
    return this.http.post<Coupon>(`${this.api}/admin`, form);
  }

  update(id: number, form: CouponForm) {
    return this.http.put<Coupon>(`${this.api}/admin/${id}`, form);
  }

  remove(id: number) {
    return this.http.delete(`${this.api}/admin/${id}`);
  }
}
