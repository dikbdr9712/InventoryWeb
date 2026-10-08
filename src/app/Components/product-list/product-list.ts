import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ItemService } from '../../services/item';
import { AuthService } from '../../services/auth';
import { CartService } from '../../services/cart';
import { ToastService } from '../../services/toast';
import { Item } from '../../models/models';
import { ItemRating, ReviewsService } from '../../services/reviews';
import { Stars } from '../stars/stars';
import { WishHeart } from '../wish-heart/wish-heart';
import { SearchBox } from '../search-box/search-box';
import { NotifyMe } from '../notify-me/notify-me';

type SortKey = 'name' | 'priceAsc' | 'priceDesc' | 'discount' | 'rating';
const SORTS: SortKey[] = ['name', 'priceAsc', 'priceDesc', 'discount', 'rating'];

// The filters live in the address (/products?q=tea&category=Food&max=500&stock=1), so a filtered list can be
// shared or bookmarked, and the header search can open it.
@Component({
  selector: 'app-product-list',
  imports: [RouterLink, DecimalPipe, Stars, WishHeart, SearchBox, NotifyMe],
  templateUrl: './product-list.html',
  styleUrl: './product-list.css'
})
export class ProductList implements OnInit {
  private itemService = inject(ItemService);
  private reviewsApi = inject(ReviewsService);
  private route = inject(ActivatedRoute);

  // average stars per product (only rated products), for the cards
  ratings = signal<Record<number, ItemRating>>({});
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
  minPrice = signal<number | null>(null);
  maxPrice = signal<number | null>(null);
  inStock = signal(false);
  rated4 = signal(false);
  onOffer = signal(false);

  sortOptions: { value: SortKey; label: string }[] = [
    { value: 'name', label: 'Name, A to Z' },
    { value: 'priceAsc', label: 'Price, low to high' },
    { value: 'priceDesc', label: 'Price, high to low' },
    { value: 'discount', label: 'Biggest discount' },
    { value: 'rating', label: 'Best rated' }
  ];

  // What a shopper may buy (staff who manage products also see switched-off ones)
  shelf = computed(() => this.auth.canManageItems() ? this.items() : this.items().filter(i => this.itemService.forSale(i)));

  // Products with sizes/colours: how many choices each main product has (1 = no options)
  private optionCounts = computed(() => {
    const ids = new Set(this.shelf().map(i => i.itemId));
    const counts = new Map<number, number>();
    for (const i of this.shelf()) {
      const head = i.variantOf && ids.has(i.variantOf) ? i.variantOf : i.itemId;
      counts.set(head, (counts.get(head) ?? 0) + 1);
    }
    return counts;
  });
  // the number of products (a product with options counts once)
  groupCount = computed(() => this.optionCounts().size);

  optionCount(item: Item): number {
    return this.optionCounts().get(item.itemId) ?? 1;
  }

  // Every category that exists in the shop, for the filter chips
  categories = computed(() => {
    const names = this.shelf().map(i => (i.category || '').trim()).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  });

  // how many of the extra filters are on (price, stock, stars, offer)
  activeFilters = computed(() =>
    [this.minPrice() !== null || this.maxPrice() !== null, this.inStock(), this.rated4(), this.onOffer()].filter(Boolean).length);

  // Search, then category and filters, then sort. Recalculates by itself when any of them change.
  visible = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const category = this.category();
    const min = this.minPrice(), max = this.maxPrice();
    const ratings = this.ratings();
    const price = (i: Item) => Number(i.sellingPrice) || 0;

    let list = this.shelf().filter(item => {
      if (category && (item.category || '').trim() !== category) return false;
      if (min !== null && price(item) < min) return false;
      if (max !== null && price(item) > max) return false;
      if (this.inStock() && this.isOut(item)) return false;
      if (this.rated4() && (ratings[item.itemId]?.average ?? 0) < 4) return false;
      if (this.onOffer() && this.discount(item) === null) return false;
      if (!term) return true;
      return (
        (item.itemName || '').toLowerCase().includes(term) ||
        (item.description || '').toLowerCase().includes(term) ||
        (item.sku || '').toLowerCase().includes(term) ||
        (item.category || '').toLowerCase().includes(term) ||
        (item.sellerName || '').toLowerCase().includes(term)
      );
    });

    // one card per product with options: an option that matches shows its main product
    const byId = new Map(this.shelf().map(i => [i.itemId, i]));
    const seen = new Set<number>();
    list = list.map(i => (i.variantOf ? byId.get(i.variantOf) : undefined) ?? i)
      .filter(i => !seen.has(i.itemId) && !!seen.add(i.itemId));

    switch (this.sort()) {
      case 'priceAsc': list = [...list].sort((a, b) => price(a) - price(b)); break;
      case 'priceDesc': list = [...list].sort((a, b) => price(b) - price(a)); break;
      case 'discount':
        list = [...list].sort((a, b) => (this.discount(b) ?? 0) - (this.discount(a) ?? 0));
        break;
      case 'rating':
        list = [...list].sort((a, b) => (ratings[b.itemId]?.average ?? 0) - (ratings[a.itemId]?.average ?? 0)
          || (ratings[b.itemId]?.count ?? 0) - (ratings[a.itemId]?.count ?? 0));
        break;
      default:
        list = [...list].sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
    }
    return list;
  });

  constructor() {
    // the address -> the filters (also when the header search opens this page again with new words)
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(p => {
      const num = (k: string) => { const v = Number(p.get(k)); return p.get(k) !== null && p.get(k) !== '' && v >= 0 ? v : null; };
      const sort = p.get('sort') as SortKey;
      this.searchTerm.set(p.get('q') ?? '');
      this.category.set(p.get('category') ?? '');
      this.sort.set(SORTS.includes(sort) ? sort : 'name');
      this.minPrice.set(num('min'));
      this.maxPrice.set(num('max'));
      this.inStock.set(p.get('stock') === '1');
      this.rated4.set(p.get('rating') === '4');
      this.onOffer.set(p.get('offer') === '1');
    });
    // the filters -> the address (replacing it, so Back still leaves the page)
    effect(() => {
      const wanted: Record<string, string | null> = {
        q: this.searchTerm().trim() || null,
        category: this.category() || null,
        sort: this.sort() === 'name' ? null : this.sort(),
        min: this.minPrice() === null ? null : String(this.minPrice()),
        max: this.maxPrice() === null ? null : String(this.maxPrice()),
        stock: this.inStock() ? '1' : null,
        rating: this.rated4() ? '4' : null,
        offer: this.onOffer() ? '1' : null
      };
      untracked(() => {
        const now = this.route.snapshot.queryParamMap;
        if (Object.entries(wanted).every(([k, v]) => now.get(k) === v)) return;
        this.router.navigate([], { relativeTo: this.route, queryParams: wanted, replaceUrl: true });
      });
    });
  }

  ngOnInit() {
    this.reviewsApi.summary().subscribe({
      next: list => this.ratings.set(Object.fromEntries(list.map(r => [r.itemId, r]))),
      error: () => this.ratings.set({})
    });
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

  setPrice(which: 'min' | 'max', text: string) {
    const value = text.trim() === '' ? null : Math.max(0, Number(text));
    (which === 'min' ? this.minPrice : this.maxPrice).set(value === null || Number.isNaN(value) ? null : value);
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
    this.minPrice.set(null);
    this.maxPrice.set(null);
    this.inStock.set(false);
    this.rated4.set(false);
    this.onOffer.set(false);
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }
}
