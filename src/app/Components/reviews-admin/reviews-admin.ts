import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AdminFeedback, AdminReview, ReviewsOverview, ReviewsService } from '../../services/reviews';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { errorText } from '../../utils/http-error';
import { Stars } from '../stars/stars';

type Tab = 'products' | 'service' | 'drivers';
type Filter = 'all' | 'low' | 'unanswered' | 'hidden';

// Staff: every rating and review. Answer customers in public, hide abusive reviews, see how drivers are rated.
@Component({
  selector: 'app-reviews-admin',
  imports: [DatePipe, RouterLink, Stars],
  templateUrl: './reviews-admin.html',
  styleUrl: './reviews-admin.css'
})
export class ReviewsAdmin implements OnInit {
  private api = inject(ReviewsService);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);

  data = signal<ReviewsOverview | null>(null);
  error = signal('');
  tab = signal<Tab>('products');
  filter = signal<Filter>('all');
  busy = signal<string | null>(null);

  products = computed(() => this.apply(this.data()?.productReviews ?? [], r => r.rating));
  service = computed(() => this.apply(this.data()?.feedback ?? [], f => Math.min(f.serviceRating, f.deliveryRating)));
  lowCount = computed(() => (this.data()?.productReviews ?? []).filter(r => r.rating <= 2 && !r.hidden).length
    + (this.data()?.feedback ?? []).filter(f => Math.min(f.serviceRating, f.deliveryRating) <= 2 && !f.hidden).length);

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.overview().subscribe({
      next: d => this.data.set(d),
      error: (err: HttpErrorResponse) => this.error.set(errorText(err))
    });
  }

  private apply<T extends { hidden: boolean; reply?: string | null }>(list: T[], lowest: (x: T) => number): T[] {
    switch (this.filter()) {
      case 'low': return list.filter(x => lowest(x) <= 2 && !x.hidden);
      case 'unanswered': return list.filter(x => !x.reply && !x.hidden);
      case 'hidden': return list.filter(x => x.hidden);
      default: return list;
    }
  }

  async reply(kind: 'products' | 'service', item: AdminReview | AdminFeedback) {
    const text = await this.confirm.prompt({
      title: item.reply ? 'Change the shop\'s answer' : 'Answer this review',
      message: `Shown publicly under ${item.displayName}'s review. The customer is told.${item.reply ? ' Leave it empty to remove the answer.' : ''}`,
      label: 'Your answer',
      placeholder: 'For example: Thank you! We are sorry about the late delivery and have spoken to our team.',
      confirmLabel: 'Post answer'
    });
    if (text === null) return;
    this.run(`${kind}${item.id}`, this.api.reply(kind, item.id, text), text.trim() ? 'Answer posted.' : 'Answer removed.');
  }

  async toggleHidden(kind: 'products' | 'service', item: AdminReview | AdminFeedback) {
    if (!item.hidden && !await this.confirm.ask({
      title: 'Hide this review?',
      message: 'It is no longer shown or counted in the average. Use this for abusive reviews or ones not about the product or service, not for honest low ratings.',
      confirmLabel: 'Hide', danger: true
    })) return;
    this.run(`${kind}${item.id}`, this.api.setHidden(kind, item.id, !item.hidden), item.hidden ? 'The review is shown again.' : 'The review is hidden.');
  }

  private run(key: string, call: ReturnType<ReviewsService['reply']>, done: string) {
    this.busy.set(key);
    call.subscribe({
      next: () => {
        this.busy.set(null);
        this.toasts.success(done);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }
}
