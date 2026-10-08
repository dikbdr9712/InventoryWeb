import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { ToastService } from './toast';
import { errorText } from '../utils/http-error';

// "Notify me when it is back" on sold-out products, for the signed-in person.
@Injectable({ providedIn: 'root' })
export class StockAlertService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private toasts = inject(ToastService);
  private api = `${environment.apiUrl}/api/stock-alerts`;

  private list = signal<number[]>([]);
  readonly ids = computed(() => new Set(this.list()));

  constructor() {
    effect(() => {
      if (this.auth.isLoggedIn()) this.http.get<number[]>(this.api).subscribe({ next: l => this.list.set(l), error: () => {} });
      else this.list.set([]);
    });
  }

  waiting(itemId: number): boolean {
    return this.ids().has(itemId);
  }

  toggle(itemId: number, name = 'this product') {
    if (!this.auth.isLoggedIn()) {
      this.toasts.info('Sign in and we will tell you when it is back.', { label: 'Sign in', link: '/login' });
      return;
    }
    const on = this.waiting(itemId);
    const before = this.list();
    this.list.set(on ? before.filter(id => id !== itemId) : [...before, itemId]);
    const call = on ? this.http.delete(`${this.api}/${itemId}`) : this.http.post(`${this.api}/${itemId}`, null);
    call.subscribe({
      next: () => this.toasts.success(on ? 'You will not be told about it.' : `We will tell you when ${name} is back.`),
      error: (err: HttpErrorResponse) => {
        this.list.set(before);
        this.toasts.error(errorText(err));
      }
    });
  }
}
