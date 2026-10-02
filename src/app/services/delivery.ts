import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { DeliveryArea, DeliveryPoint, DeliveryQuote } from '../models/models';

// Delivery prices and delivery areas. The price always comes from the server, never from the browser.
@Injectable({ providedIn: 'root' })
export class DeliveryService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/delivery`;

  areas() {
    return this.http.get<DeliveryArea[]>(`${this.api}/areas`);
  }

  // What delivering these products to this point costs (one fee per seller)
  quote(items: { itemId: number; quantity: number }[], point: DeliveryPoint | null) {
    return this.http.post<DeliveryQuote>(`${this.api}/quote`, {
      items,
      latitude: point?.areaId ? null : point?.latitude ?? null,
      longitude: point?.areaId ? null : point?.longitude ?? null,
      areaId: point?.areaId ?? null
    });
  }

  // ---------- Admin ----------
  allAreas() {
    return this.http.get<DeliveryArea[]>(`${this.api}/admin/areas`);
  }

  saveArea(area: Omit<DeliveryArea, 'id'>, id?: number) {
    return id
      ? this.http.put<DeliveryArea>(`${this.api}/admin/areas/${id}`, area)
      : this.http.post<DeliveryArea>(`${this.api}/admin/areas`, area);
  }

  deleteArea(id: number) {
    return this.http.delete<void>(`${this.api}/admin/areas/${id}`);
  }
}
