import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { Item, RestockRequest } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ItemService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/items`;

  getAll() {
    return this.http.get<Item[]>(`${this.api}/allItems`);
  }

  // The whole product list for pages that show a few products (similar, recently viewed, wishlist, a seller's
  // shop, search suggestions): downloaded once and kept for 2 minutes. A failed download is not kept.
  private cached?: { at: number; list: Observable<Item[]> };
  catalog(): Observable<Item[]> {
    if (!this.cached || Date.now() - this.cached.at > 120_000) {
      const list = this.getAll().pipe(
        catchError(err => { this.cached = undefined; return throwError(() => err); }),
        shareReplay(1)
      );
      this.cached = { at: Date.now(), list };
    }
    return this.cached.list;
  }

  // Staff with "Run offers": a deal (until a time, or until changed), featured, or neither, on the home page
  setHighlight(itemId: number, highlight: 'DEAL' | 'FEATURED' | null, dealEndsAt: string | null) {
    this.cached = undefined; // the home page should show it at once
    return this.http.put<Item>(`${this.api}/${itemId}/highlight`, { highlight, dealEndsAt });
  }

  // A product's options (sizes, colours): its main product and the main product's options, the main one first
  optionsOf(item: Item, all: Item[]): Item[] {
    const headId = item.variantOf ?? item.itemId;
    const head = all.find(i => i.itemId === headId);
    // in the order they were added (staff add sizes S, M, L in order; alphabetical would give L, M, S)
    const children = all.filter(i => i.variantOf === headId && this.forSale(i)).sort((a, b) => a.itemId - b.itemId);
    const group = [...(head && this.forSale(head) ? [head] : []), ...children];
    return group.length > 1 ? group : [];
  }

  // Products a shopper should be offered (staff also get switched-off ones in the list)
  forSale(item: Item): boolean {
    return item.isActive !== false;
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