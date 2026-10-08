import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface SellerShop {
  id: number;
  shopName: string;
  town?: string | null;
  description?: string | null;
  since?: string | null;
  rating: number;       // average stars of their products' reviews (0 = none yet)
  ratingCount: number;
  products: number;
}

// A seller's public shop page
@Injectable({ providedIn: 'root' })
export class SellerShopService {
  private http = inject(HttpClient);

  get(id: number) {
    return this.http.get<SellerShop>(`${environment.apiUrl}/api/sellers/${id}`);
  }
}
