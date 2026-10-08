import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Item } from '../../models/models';
import { ItemService } from '../../services/item';
import { CartService } from '../../services/cart';
import { ToastService } from '../../services/toast';
import { WishlistService } from '../../services/wishlist';
import { NotifyMe } from '../notify-me/notify-me';

// "My wishlist": the products the person saved with the heart, newest first.
@Component({
  selector: 'app-wishlist',
  imports: [RouterLink, DecimalPipe, NotifyMe],
  templateUrl: './wishlist.html',
  styleUrl: './wishlist.css'
})
export class WishlistPage {
  private itemService = inject(ItemService);
  private cart = inject(CartService);
  private toasts = inject(ToastService);
  wishlist = inject(WishlistService);

  private catalog = signal<Item[]>([]);
  loading = signal(true);

  // saved products that can still be bought, and the ones that cannot (removed or switched off)
  saved = computed(() => {
    const byId = new Map(this.catalog().map(i => [i.itemId, i]));
    return this.wishlist.order().map(id => ({ id, item: byId.get(id) }))
      .map(s => ({ ...s, item: s.item && this.itemService.forSale(s.item) ? s.item : undefined }));
  });

  constructor() {
    this.itemService.catalog().subscribe({
      next: list => { this.catalog.set(list); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  image(item: Item) { return this.itemService.imageFor(item); }
  discount(item: Item) { return this.itemService.discountPercent(item); }

  isOut(item: Item): boolean {
    const stock = this.itemService.stockOf(item);
    return stock !== null && stock <= 0;
  }

  addToCart(item: Item) {
    this.cart.add({
      id: item.itemId, name: item.itemName, price: Number(item.sellingPrice) || 0, image: this.image(item),
      sellerId: item.sellerId ?? null, sellerName: item.sellerName
    });
    this.toasts.success(`${item.itemName} added to your cart.`, { label: 'View cart', link: '/cart' });
  }

  remove(id: number, name = 'This product') {
    this.wishlist.toggle(id, name);
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }
}
