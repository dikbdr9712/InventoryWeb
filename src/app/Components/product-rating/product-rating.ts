import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ItemService } from '../../services/item';
import { ItemRating, ReviewsService, ServiceReviews } from '../../services/reviews';
import { Item } from '../../models/models';
import { Stars } from '../stars/stars';

// The Customer reviews page: real ratings from customers whose orders were delivered.
// How they rate our service and the delivery, what they wrote, and the best-rated products.
@Component({
  selector: 'app-product-rating',
  imports: [RouterLink, DatePipe, Stars],
  templateUrl: './product-rating.html',
  styleUrl: './product-rating.css'
})
export class ProductRating implements OnInit {
  private reviews = inject(ReviewsService);
  private itemService = inject(ItemService);

  service = signal<ServiceReviews | null>(null);
  ratings = signal<ItemRating[]>([]);
  products = signal<Item[]>([]);
  error = signal(false);

  // the best-rated products (at least one review), best first, then the most reviewed
  topProducts = computed(() => {
    const byId = new Map(this.products().map(p => [p.itemId, p]));
    return this.ratings()
      .filter(r => byId.has(r.itemId))
      .sort((a, b) => b.average - a.average || b.count - a.count)
      .slice(0, 6)
      .map(r => ({ rating: r, item: byId.get(r.itemId)! }));
  });

  ngOnInit() {
    forkJoin({ service: this.reviews.service(), ratings: this.reviews.summary(), products: this.itemService.getAll() }).subscribe({
      next: ({ service, ratings, products }) => {
        this.service.set(service);
        this.ratings.set(ratings);
        this.products.set(products);
      },
      error: () => this.error.set(true)
    });
  }

  image(item: Item) {
    return this.itemService.imageFor(item);
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }
}
