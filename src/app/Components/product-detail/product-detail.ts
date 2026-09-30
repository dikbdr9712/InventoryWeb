import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ItemService } from '../../services/item';
import { AuthService } from '../../services/auth';
import { CartService } from '../../services/cart';
import { ToastService } from '../../services/toast';
import { Item } from '../../models/models';

// URL: /products/12
@Component({
  selector: 'app-product-detail',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.css'
})
export class ProductDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private itemService = inject(ItemService);
  private cart = inject(CartService);
  private toasts = inject(ToastService);
  auth = inject(AuthService);

  item = signal<Item | null>(null);
  error = signal('');
  quantity = signal(1);

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

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.error.set('This product link is not valid.');
      return;
    }

    this.itemService.getById(id).subscribe({
      next: item => this.item.set(item),
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
      image: this.image(item)
    }, qty);

    const inCart = this.cart.items().find(i => i.id === item.itemId)?.quantity ?? qty;
    this.toasts.success(
      inCart > qty
        ? `${qty} x ${item.itemName} added. You now have ${inCart} in your cart.`
        : `${qty} x ${item.itemName} added to your cart.`,
      { label: 'View cart', link: '/cart' }
    );
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }
}
