import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
  action?: { label: string; link: string };
}

// One place for every short message on the site.
// Use it instead of alert(): it never blocks the page and it dismisses itself.
@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts = signal<Toast[]>([]);
  private nextId = 1;

  success(message: string, action?: { label: string; link: string }) {
    this.show('success', message, 4000, action);
  }

  info(message: string, action?: { label: string; link: string }) {
    this.show('info', message, 4000, action);
  }

  // Problems stay a little longer so they can be read
  error(message: string) {
    this.show('error', message, 7000);
  }

  dismiss(id: number) {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  private show(kind: Toast['kind'], message: string, ms: number, action?: Toast['action']) {
    const id = this.nextId++;
    // keep at most 3 on screen
    this.toasts.update(list => [...list.slice(-2), { id, kind, message, action }]);
    setTimeout(() => this.dismiss(id), ms);
  }
}
