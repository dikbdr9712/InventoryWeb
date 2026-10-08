import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { ToastService } from './toast';
import { errorText } from '../utils/http-error';

// The signed-in person's wishlist (the heart on products). Loaded after sign-in; a heart changes at once and
// changes back if the server says no.
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private toasts = inject(ToastService);
  private api = `${environment.apiUrl}/api/wishlist`;

  readonly order = signal<number[]>([]); // newest first
  readonly ids = computed(() => new Set(this.order()));
  readonly count = computed(() => this.order().length);

  constructor() {
    effect(() => {
      if (this.auth.isLoggedIn()) this.load();
      else this.order.set([]);
    });
  }

  load() {
    this.http.get<{ itemId: number; addedAt: string }[]>(this.api).subscribe({
      next: list => this.order.set(list.map(s => s.itemId)),
      error: () => {} // the hearts simply stay empty
    });
  }

  has(itemId: number): boolean {
    return this.ids().has(itemId);
  }

  toggle(itemId: number, name = 'This product') {
    if (!this.auth.isLoggedIn()) {
      this.toasts.info('Sign in to save products to your wishlist.', { label: 'Sign in', link: '/login' });
      return;
    }
    const saved = this.has(itemId);
    const before = this.order();
    this.order.set(saved ? before.filter(id => id !== itemId) : [itemId, ...before]);
    const call = saved ? this.http.delete(`${this.api}/${itemId}`) : this.http.post(`${this.api}/${itemId}`, null);
    call.subscribe({
      next: () => {
        if (!saved) this.toasts.success(`${name} saved to your wishlist.`, { label: 'View wishlist', link: '/wishlist' });
      },
      error: (err: HttpErrorResponse) => {
        this.order.set(before);
        this.toasts.error(errorText(err));
      }
    });
  }
}
