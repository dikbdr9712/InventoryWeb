import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Item } from '../../models/models';
import { ItemService } from '../../services/item';
import { SellerShop, SellerShopService } from '../../services/seller-shop';
import { Stars } from '../stars/stars';
import { ProductRow } from '../product-row/product-row';

// A seller's shop: /shop/7. Who they are, how buyers rate them, and everything they sell.
@Component({
  selector: 'app-seller-shop',
  imports: [DatePipe, RouterLink, Stars, ProductRow],
  templateUrl: './seller-shop.html',
  styleUrl: './seller-shop.css'
})
export class SellerShopPage {
  private route = inject(ActivatedRoute);
  private itemService = inject(ItemService);
  private shopApi = inject(SellerShopService);

  shop = signal<SellerShop | null>(null);
  error = signal('');
  private catalog = signal<Item[]>([]);
  search = signal('');

  products = computed(() => {
    const id = this.shop()?.id;
    const term = this.search().trim().toLowerCase();
    return this.catalog()
      .filter(i => i.sellerId === id && this.itemService.forSale(i))
      .filter(i => !term || (i.itemName || '').toLowerCase().includes(term) || (i.category || '').toLowerCase().includes(term))
      .sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
  });

  constructor() {
    this.itemService.catalog().subscribe({ next: list => this.catalog.set(list), error: () => {} });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(p => {
      this.shop.set(null);
      this.error.set('');
      this.shopApi.get(Number(p.get('id'))).subscribe({
        next: s => this.shop.set(s),
        error: () => this.error.set('This shop was not found. It may have closed.')
      });
    });
  }

  initial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }
}
