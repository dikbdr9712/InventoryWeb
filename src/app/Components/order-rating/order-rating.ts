import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ItemService } from '../../services/item';
import { OrderRating as Rating, RateItem, ReviewsService } from '../../services/reviews';
import { ToastService } from '../../services/toast';
import { errorText } from '../../utils/http-error';
import { Stars } from '../stars/stars';

interface ItemDraft { stars: number | null; comment: string; saving: boolean; saved: boolean; editing: boolean; }

// "Rate your order" on the customer's order page, once something in it was delivered:
// stars and a comment for each product, and for the shop's service and the delivery.
@Component({
  selector: 'app-order-rating',
  imports: [FormsModule, RouterLink, Stars],
  templateUrl: './order-rating.html',
  styleUrl: './order-rating.css'
})
export class OrderRatingPanel implements OnInit {
  private reviews = inject(ReviewsService);
  private itemService = inject(ItemService);
  private toasts = inject(ToastService);

  orderId = input.required<number>();

  rating = signal<Rating | null>(null);
  drafts = signal<Record<number, ItemDraft>>({});

  serviceStars = signal<number | null>(null);
  deliveryStars = signal<number | null>(null);
  serviceComment = '';
  serviceSaving = signal(false);
  serviceSaved = signal(false);
  serviceEditing = signal(true);

  ngOnInit() {
    this.reviews.forOrder(this.orderId()).subscribe({
      next: r => {
        this.rating.set(r);
        const d: Record<number, ItemDraft> = {};
        for (const i of r.items) {
          d[i.itemId] = { stars: i.myRating ?? null, comment: i.myComment ?? '', saving: false, saved: !!i.myRating, editing: !i.myRating };
        }
        this.drafts.set(d);
        if (r.feedback) {
          this.serviceStars.set(r.feedback.serviceRating);
          this.deliveryStars.set(r.feedback.deliveryRating);
          this.serviceComment = r.feedback.comment ?? '';
          this.serviceSaved.set(true);
          this.serviceEditing.set(false);
        }
      },
      error: () => this.rating.set(null) // not their order, or the server is waking up: show nothing
    });
  }

  image(i: RateItem) {
    return this.itemService.imageUrl(i.imagePath ?? undefined);
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }

  draft(itemId: number): ItemDraft {
    return this.drafts()[itemId];
  }

  private patch(itemId: number, change: Partial<ItemDraft>) {
    this.drafts.update(all => ({ ...all, [itemId]: { ...all[itemId], ...change } }));
  }

  setStars(itemId: number, stars: number | null) {
    this.patch(itemId, { stars });
  }

  setComment(itemId: number, comment: string) {
    this.patch(itemId, { comment });
  }

  edit(itemId: number) {
    this.patch(itemId, { editing: true });
  }

  saveItem(i: RateItem) {
    const d = this.draft(i.itemId);
    if (!d.stars) {
      this.toasts.error(`Choose 1 to 5 stars for ${i.name}.`);
      return;
    }
    this.patch(i.itemId, { saving: true });
    this.reviews.rateProduct(this.orderId(), i.itemId, d.stars, d.comment).subscribe({
      next: () => {
        this.patch(i.itemId, { saving: false, saved: true, editing: false });
        this.toasts.success(`Thank you for rating ${i.name}.`);
      },
      error: (err: HttpErrorResponse) => {
        this.patch(i.itemId, { saving: false });
        this.toasts.error(errorText(err));
      }
    });
  }

  saveService() {
    const service = this.serviceStars();
    const delivery = this.deliveryStars();
    if (!service || !delivery) {
      this.toasts.error('Choose stars for our service and for the delivery.');
      return;
    }
    this.serviceSaving.set(true);
    this.reviews.rateService(this.orderId(), service, delivery, this.serviceComment).subscribe({
      next: () => {
        this.serviceSaving.set(false);
        this.serviceSaved.set(true);
        this.serviceEditing.set(false);
        this.toasts.success('Thank you for your feedback.');
      },
      error: (err: HttpErrorResponse) => {
        this.serviceSaving.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }
}
