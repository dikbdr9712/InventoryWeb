import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Item, RestockRequest } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ItemService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/items`;

  getAll() {
    return this.http.get<Item[]>(`${this.api}/allItems`);
  }

  getById(id: number) {
    return this.http.get<Item>(`${this.api}/${id}`);
  }

  search(term: string) {
    return this.http.get<Item[]>(`${this.api}/search`, { params: { term } });
  }

  create(data: FormData) {
    return this.http.post(`${this.api}/addItems`, data, { responseType: 'text' });
  }

  update(id: number, data: FormData) {
    return this.http.put(`${this.api}/${id}`, data, { responseType: 'text' });
  }

  restock(request: RestockRequest) {
    return this.http.post(`${environment.apiUrl}/api/transactions/purchase`, request, { responseType: 'text' });
  }

    // The API sends the stock number as currentQuantity (currentStock and quantity are null)
  stockOf(item: Item): number | null {
    const value = item.currentQuantity ?? item.currentStock ?? item.quantity;
    return value == null ? null : Number(value);
  }

  // Image from the server path, or Images/default.jpg
  imageUrl(path?: string): string {
    if (!path) return 'Images/default.jpg';
    return path.startsWith('http') ? path : environment.imageBase + path;
  }

  // Same rule as product.js: uploaded image, otherwise Images/<itemname>.jpg
  imageFor(item: Item): string {
    if (item.imagePath && item.imagePath.trim()) return this.imageUrl(item.imagePath);
    return 'Images/' + (item.itemName || '').toLowerCase().replace(/\s+/g, '') + '.jpg';
  }

  // Discount % when selling price is below MRP, otherwise null
  discountPercent(item: Item): number | null {
    const mrp = item.mrp != null ? Number(item.mrp) : null;
    const selling = item.sellingPrice != null ? Number(item.sellingPrice) : null;
    if (mrp && selling !== null && selling < mrp) {
      return Math.round(((mrp - selling) / mrp) * 100);
    }
    return null;
  }
}