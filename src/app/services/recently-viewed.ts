import { Injectable, signal } from '@angular/core';

const KEY = 'recentlyViewed';
const MAX = 12;

function read(): number[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter(n => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

// The last products opened on this device (newest first), for "Recently viewed". Kept in the browser only.
@Injectable({ providedIn: 'root' })
export class RecentlyViewed {
  readonly ids = signal<number[]>(read());

  add(itemId: number) {
    const list = [itemId, ...this.ids().filter(id => id !== itemId)].slice(0, MAX);
    this.ids.set(list);
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      // private mode: it simply is not remembered
    }
  }
}
