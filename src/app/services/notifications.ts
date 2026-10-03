import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body?: string;
  link?: string;
  createdAt: string;
  read: boolean;
}

const EVERY_MS = 60_000;

// The signed-in person's notifications (the bell). The unread count is checked every minute while the
// page is visible, and at once when the person comes back to the tab.
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private api = `${environment.apiUrl}/api/notifications`;
  private timer?: ReturnType<typeof setInterval>;

  items = signal<AppNotification[]>([]);
  unread = signal(0);
  loading = signal(false);

  constructor() {
    effect(() => (this.auth.isLoggedIn() ? this.start() : this.stop()));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.auth.isLoggedIn()) this.refreshCount();
    });
  }

  load() {
    this.loading.set(true);
    this.http.get<{ items: AppNotification[]; unread: number }>(this.api, { params: { limit: 30 } }).subscribe({
      next: r => {
        this.items.set(r.items);
        this.unread.set(r.unread);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  refreshCount() {
    this.http.get<{ unread: number }>(`${this.api}/unread-count`).subscribe({
      next: r => this.unread.set(r.unread),
      error: () => {}
    });
  }

  markRead(n: AppNotification) {
    if (n.read) return;
    this.items.update(list => list.map(x => (x.id === n.id ? { ...x, read: true } : x)));
    this.unread.update(c => Math.max(0, c - 1));
    this.http.post<{ unread: number }>(`${this.api}/${n.id}/read`, null).subscribe({
      next: r => this.unread.set(r.unread),
      error: () => {}
    });
  }

  markAllRead() {
    this.items.update(list => list.map(x => ({ ...x, read: true })));
    this.unread.set(0);
    this.http.post(`${this.api}/read-all`, null).subscribe({ error: () => {} });
  }

  private start() {
    if (this.timer) return;
    this.refreshCount();
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.refreshCount();
    }, EVERY_MS);
  }

  private stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.items.set([]);
    this.unread.set(0);
  }
}
