import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ItemService } from '../../services/item';
import { AuthService } from '../../services/auth';
import { CartService } from '../../services/cart';
import { ToastService } from '../../services/toast';
import { RecentlyViewed } from '../../services/recently-viewed';
import { ShopDetails } from '../../services/shop-details';
import { Item } from '../../models/models';
import { ProductReviews, ReviewsService } from '../../services/reviews';
import { Stars } from '../stars/stars';
import { WishHeart } from '../wish-heart/wish-heart';
import { ProductRow } from '../product-row/product-row';
import { NotifyMe } from '../notify-me/notify-me';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { dealEnds } from '../../utils/deals';
import { errorText } from '../../utils/http-error';

// URL: /products/12. Opening another product from "You may also like" reuses this page, so everything is
// loaded again whenever the number in the address changes.
@Component({
  selector: 'app-product-detail',
  imports: [RouterLink, DecimalPipe, DatePipe, Stars, WishHeart, ProductRow, NotifyMe, FormsModule],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.css'
})
export class ProductDetail {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private itemService = inject(ItemService);
  private cart = inject(CartService);
  private toasts = inject(ToastService);
  private reviewsApi = inject(ReviewsService);
  private recentlyViewed = inject(RecentlyViewed);
  private shop = inject(ShopDetails);
  auth = inject(AuthService);

  reviews = signal<ProductReviews | null>(null);

  item = signal<Item | null>(null);
  error = signal('');
  quantity = signal(1);
  private catalog = signal<Item[]>([]);
  readonly canShareNatively = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // Highest quantity the customer can pick (unknown stock means no limit)
  maxQuantity = computed(() => {
    const item = this.item();
    const stock = item ? this.itemService.stockOf(item) : null;
    return stock === null ? 99 : stock;
  });

  savings = computed(() => {
    const item = this.item();
    if (!item) return 0;
    const mrp = Number(item.mrp) || 0;
    const price = Number(item.sellingPrice) || 0;
    return mrp > price ? mrp - price : 0;
  });

  // Sizes and colours: the main product and its options (empty when it has none)
  options = computed(() => {
    const item = this.item();
    return item ? this.itemService.optionsOf(item, this.catalog()) : [];
  });

  // The photos: the main one, then the others
  gallery = computed(() => {
    const item = this.item();
    if (!item) return [];
    return [this.image(item), ...(item.photos ?? []).map(p => this.itemService.imageUrl(p.path))];
  });
  shown = signal(0);
  showPhoto(step: number) {
    const n = this.gallery().length;
    if (n > 1) this.shown.set((this.shown() + step + n) % n);
  }

  // A deal: when it ends
  readonly dealEnds = dealEnds;

  // Staff with "Run offers": show it on the home page as a deal (until a time) or featured
  canOffer = computed(() => this.auth.can('offers.manage'));
  offer = { choice: 'NONE' as 'NONE' | 'DEAL' | 'FEATURED', until: '' };
  savingOffer = signal(false);
  saveOffer(item: Item) {
    const highlight = this.offer.choice === 'NONE' ? null : this.offer.choice;
    const until = this.offer.choice === 'DEAL' && this.offer.until ? new Date(this.offer.until).toISOString() : null;
    this.savingOffer.set(true);
    this.itemService.setHighlight(item.itemId, highlight, until).subscribe({
      next: updated => {
        this.savingOffer.set(false);
        this.item.set({ ...item, ...updated });
        this.toasts.success(highlight === 'DEAL' ? 'It is a deal on the home page now.'
          : highlight === 'FEATURED' ? 'It is featured on the home page now.' : 'It is not on the home page any more.');
      },
      error: (err: HttpErrorResponse) => {
        this.savingOffer.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  // "You may also like": the same category first (then the same seller, then offers), in stock before sold out
  similar = computed(() => {
    const item = this.item();
    if (!item) return [];
    const others = this.catalog().filter(i => i.itemId !== item.itemId && this.itemService.forSale(i));
    const score = (i: Item) =>
      (item.category && i.category === item.category ? 4 : 0)
      + (item.sellerId != null && i.sellerId === item.sellerId ? 2 : 0)
      + (this.itemService.discountPercent(i) !== null ? 1 : 0)
      - (this.isOut(i) ? 5 : 0);
    return others
      .map(i => ({ i, s: score(i) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || (a.i.itemName || '').localeCompare(b.i.itemName || ''))
      .slice(0, 10)
      .map(x => x.i);
  });

  // what this person opened before (not this product)
  recent = computed(() => {
    const id = this.item()?.itemId;
    const byId = new Map(this.catalog().filter(i => this.itemService.forSale(i)).map(i => [i.itemId, i]));
    return this.recentlyViewed.ids().filter(x => x !== id).map(x => byId.get(x)).filter((i): i is Item => !!i).slice(0, 10);
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => this.load(Number(params.get('id'))));
    this.itemService.catalog().subscribe({ next: list => this.catalog.set(list), error: () => {} });
  }

  private load(id: number) {
    this.item.set(null);
    this.reviews.set(null);
    this.error.set('');
    this.quantity.set(1);
    this.shown.set(0);
    // the product list (for options, similar, recently viewed) failed before: try again
    if (this.catalog().length === 0) {
      this.itemService.catalog().subscribe({ next: list => this.catalog.set(list), error: () => {} });
    }
    if (!id) {
      this.error.set('This product link is not valid.');
      return;
    }

    this.reviewsApi.product(id).subscribe({ next: r => this.reviews.set(r), error: () => this.reviews.set(null) });

    this.itemService.getById(id).subscribe({
      next: item => {
        this.item.set(item);
        if (item) {
          this.recentlyViewed.add(item.itemId);
          // the staff "on the home page" box starts with what the product has now (the end in local time)
          const end = item.dealEndsAt ? new Date(item.dealEndsAt) : null;
          const local = end ? new Date(end.getTime() - end.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
          this.offer = { choice: item.highlight ?? 'NONE', until: local };
        }
      },
      error: err => {
        if (err.status === 401) {
          this.router.navigate(['/login'], { queryParams: { returnUrl: `/products/${id}` } });
          return;
        }
        this.error.set('We could not load this product. It may have been removed.');
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

  stockText(item: Item): string {
    const stock = this.stock(item);
    if (stock === null) return item.availability === 'Available' ? 'In stock' : 'Availability unknown';
    if (stock <= 0) return 'Out of stock';
    if (stock <= 5) return `Only ${stock} left`;
    return `In stock (${stock} ${item.uom || 'pcs'})`;
  }

  stockClass(item: Item): string {
    const stock = this.stock(item);
    if (stock !== null && stock <= 0) return 'pill-bad';
    if (stock !== null && stock <= 5) return 'pill-wait';
    return 'pill-ok';
  }

  changeQuantity(delta: number) {
    this.setQuantity(this.quantity() + delta);
  }

  onQuantityInput(input: HTMLInputElement) {
    this.setQuantity(Number(input.value));
    input.value = String(this.quantity()); // show the corrected number
  }

  private setQuantity(value: number) {
    const qty = Math.max(1, Math.min(Math.trunc(value) || 1, this.maxQuantity()));
    this.quantity.set(qty);
  }

  addToCart(item: Item) {
    if (this.isOut(item)) return;
    const qty = this.quantity();
    this.cart.add({
      id: item.itemId,
      name: item.itemName,
      price: Number(item.sellingPrice) || 0,
      image: this.image(item),
      sellerId: item.sellerId ?? null,
      sellerName: item.sellerName
    }, qty);

    const inCart = this.cart.items().find(i => i.id === item.itemId)?.quantity ?? qty;
    this.toasts.success(
      inCart > qty
        ? `${qty} x ${item.itemName} added. You now have ${inCart} in your cart.`
        : `${qty} x ${item.itemName} added to your cart.`,
      { label: 'View cart', link: '/cart' }
    );
  }

  // ---------- Sharing ----------
  // The shared link opens a small page with the product's name, price and photo for WhatsApp's and Facebook's
  // preview, which then goes on to this page (see ShareController on the server).
  shareLink(item: Item): string {
    return `${location.origin}/api/share/products/${item.itemId}`;
  }

  private shareText(item: Item): string {
    const price = item.sellingPrice != null ? ` for Nu. ${Number(item.sellingPrice).toFixed(2)}` : '';
    return `${item.itemName}${price} on DP DrukBazaars`;
  }

  whatsappShare(item: Item): string {
    return 'https://wa.me/?text=' + encodeURIComponent(`${this.shareText(item)}: ${this.shareLink(item)}`);
  }

  facebookShare(item: Item): string {
    return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(this.shareLink(item));
  }

  // "Ask on WhatsApp": a message to the shop with this product's link (only when the shop's phone is known)
  askOnWhatsApp(item: Item): string | null {
    const digits = (this.shop.phone || '').replace(/\D/g, '');
    if (digits.length < 8) return null;
    const number = digits.length === 8 ? '975' + digits : digits;
    const text = `Hello DP DrukBazaars, I have a question about ${item.itemName}: ${location.origin}/products/${item.itemId}`;
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  }

  async copyLink(item: Item) {
    try {
      await navigator.clipboard.writeText(this.shareLink(item));
      this.toasts.success('Link copied. Paste it anywhere to share.');
    } catch {
      this.toasts.error('The link could not be copied. Hold the address bar to copy it instead.');
    }
  }

  async shareNatively(item: Item) {
    try {
      await navigator.share({ title: item.itemName, text: this.shareText(item), url: this.shareLink(item) });
    } catch {
      // closed without sharing: nothing to do
    }
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }

  toReviews(event: Event) {
    event.preventDefault();
    document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
