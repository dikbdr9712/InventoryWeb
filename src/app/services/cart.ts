import { Injectable, computed, signal } from '@angular/core';
import { CartItem } from '../models/models';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly key = 'cart';

  items = signal<CartItem[]>(this.read());
  total = computed(() => this.items().reduce((sum, i) => sum + i.price * i.quantity, 0));
  count = computed(() => this.items().reduce((sum, i) => sum + i.quantity, 0));

  add(item: Omit<CartItem, 'quantity'>, quantity = 1) {
    const existing = this.items().find(i => i.id === item.id);
    if (existing) {
      this.setQuantity(item.id, existing.quantity + quantity);
    } else {
      this.save([...this.items(), { ...item, quantity }]);
    }
  }

  setQuantity(id: number, quantity: number) {
    const updated = quantity <= 0
      ? this.items().filter(i => i.id !== id)
      : this.items().map(i => (i.id === id ? { ...i, quantity } : i));
    this.save(updated);
  }

  clear() {
    this.save([]);
  }

  private read(): CartItem[] {
    try {
      return JSON.parse(localStorage.getItem(this.key) ?? '[]');
    } catch {
      return [];
    }
  }

  private save(items: CartItem[]) {
    localStorage.setItem(this.key, JSON.stringify(items));
    this.items.set(items);
  }
}
