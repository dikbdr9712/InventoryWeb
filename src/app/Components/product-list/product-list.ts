import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ItemService } from '../../services/item';
import { AuthService } from '../../services/auth';
import { CartService } from '../../services/cart';
import { ToastService } from '../../services/toast';
import { Item } from '../../models/models';

type SortKey = 'name' | 'priceAsc' | 'priceDesc' | 'discount';

@Component({
  selector: 'app-product-list',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './product-list.html',
  styleUrl: './product-list.css'
})
export class ProductList implements OnInit {
  private itemService = inject(ItemService);
  private router = inject(Router);
  private cart = inject(CartService);
  private toasts = inject(ToastService);
  auth = inject(AuthService);

  items = signal<Item[]>([]);
  loading = signal(true);
  error = signal('');

  searchTerm = signal('');
  category = signal('');
  sort = signal<SortKey>('name');

  sortOptions: { value: SortKey; label: string }[] = [
    { value: 'name', label: 'Name, A to Z' },
    { value: 'priceAsc', label: 'Price, low to high' },
    { value: 'priceDesc', label: 'Price, high to low' },
    { value: 'discount', label: 'Biggest discount' }
  ];

  // Every category that exists in the shop, for the filter chips
  categories = computed(() => {
    const names = this.items().map(i => (i.category || '').trim()).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  });

  // Search, then category, then sort. Recalculates by itself when any of them change.
  visible = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const category = this.category();

    let list = this.items().filter(item => {
      if (category && (item.category || '').trim() !== category) return false;
      if (!term) return true;
      return (
        (item.itemName || '').toLowerCase().includes(term) ||
        (item.description || '').toLowerCase().includes(term) ||
        (item.sku || '').toLowerCase().includes(term) ||
        (item.category || '').toLowerCase().includes(term)
      );
    });

    const price = (i: Item) => Number(i.sellingPrice) || 0;
    switch (this.sort()) {
      case 'priceAsc': list = [...list].sort((a, b) => price(a) - price(b)); break;
      case 'priceDesc': list = [...list].sort((a, b) => price(b) - price(a)); break;
      case 'discount':
        list = [...list].sort((a, b) => (this.discount(b) ?? 0) - (this.discount(a) ?? 0));
        break;
      default:
        list = [...list].sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
    }
    return list;
  });

  ngOnInit() {
    this.itemService.getAll().subscribe({
      next: items => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        if (err.status === 401) {
          this.router.navigate(['/login'], { queryParams: { returnUrl: '/products' } });
          return;
        }
        this.error.set('We could not load the products. Please try again in a moment.');
      }
    });
  }

  image(item: Item) {
    return this.itemService.imageFor(item);
  }

  discount(item: Item) {
    return this.itemService.discountPercent(item);
  }

  stock(item: Item) {
    return this.itemService.stockOf(item);
  }

  isOut(item: Item): boolean {
    const stock = this.stock(item);
    return stock !== null && stock <= 0;
  }

  // Short text under the price
  stockText(item: Item): string {
    const stock = this.stock(item);
    if (stock === null) return item.availability === 'Available' ? 'In stock' : '';
    if (stock <= 0) return 'Out of stock';
    if (stock <= 5) return `Only ${stock} left`;
    return 'In stock';
  }

  stockClass(item: Item): string {
    const stock = this.stock(item);
    if (stock !== null && stock <= 0) return 'out';
    if (stock !== null && stock <= 5) return 'low';
    return 'ok';
  }

  addToCart(item: Item) {
    if (this.isOut(item)) return;
    this.cart.add({
      id: item.itemId,
      name: item.itemName,
      price: Number(item.sellingPrice) || 0,
      image: this.image(item),
      sellerId: item.sellerId ?? null,
      sellerName: item.sellerName
    });
    // Say how many the customer now has, because pressing Add again stacks up
    const inCart = this.cart.items().find(i => i.id === item.itemId)?.quantity ?? 1;
    this.toasts.success(
      inCart > 1 ? `${item.itemName} added. You now have ${inCart} in your cart.` : `${item.itemName} added to your cart.`,
      { label: 'View cart', link: '/cart' }
    );
  }

  clearFilters() {
    this.searchTerm.set('');
    this.category.set('');
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }
}
