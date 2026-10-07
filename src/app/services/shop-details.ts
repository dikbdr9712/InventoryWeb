import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { SHOP } from '../utils/shop-info';

// The shop's contact details and links, managed by staff in Website > About page.
export interface ShopDetailsData {
  phone: string;
  otherPhones: string; // more numbers for the Contact page, comma-separated
  email: string;
  address: string;
  facebook: string;
  instagram: string;
  youtube: string;
  tiktok: string;
}

// Used until the server answers (or when it cannot be reached)
const FALLBACK: ShopDetailsData = {
  phone: SHOP.phone, otherPhones: '', email: SHOP.email, address: SHOP.address,
  facebook: '', instagram: '', youtube: '', tiktok: ''
};

// Loaded once for the whole website. Pages read shop.phone, shop.email, ... and update by themselves when the
// details arrive or change.
@Injectable({ providedIn: 'root' })
export class ShopDetails {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/site`;
  private data = signal<ShopDetailsData>(FALLBACK);

  constructor() {
    this.reload();
  }

  reload() {
    this.http.get<Partial<ShopDetailsData>>(`${this.api}/info`).subscribe({
      next: d => this.data.set({ ...FALLBACK, ...Object.fromEntries(Object.entries(d ?? {}).map(([k, v]) => [k, v ?? ''])) }),
      error: () => {} // keep what we have
    });
  }

  save(details: ShopDetailsData) {
    return this.http.put<ShopDetailsData>(`${this.api}/admin/info`, details);
  }

  set(details: ShopDetailsData) {
    this.data.set(details);
  }

  readonly details = this.data.asReadonly();

  get name() { return SHOP.name; }
  get phone() { return this.data().phone; }
  get email() { return this.data().email; }
  get address() { return this.data().address; }

  // every phone number: the main one first
  readonly phones = computed(() => [this.data().phone, ...this.data().otherPhones.split(',')].map(p => p.trim()).filter(Boolean));

  // the links that are filled in, for the icons in the footer
  readonly links = computed(() => {
    const d = this.data();
    return [
      { label: 'Facebook', icon: 'fa-facebook-f', url: d.facebook },
      { label: 'Instagram', icon: 'fa-instagram', url: d.instagram },
      { label: 'YouTube', icon: 'fa-youtube', url: d.youtube },
      { label: 'TikTok', icon: 'fa-tiktok', url: d.tiktok }
    ].filter(l => /^https:\/\//.test(l.url));
  });

  // for tel: links ("77 26 97 12" -> "77269712")
  dial(phone: string) {
    return 'tel:' + phone.replace(/[^\d+]/g, '');
  }
}
