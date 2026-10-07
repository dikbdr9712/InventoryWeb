import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

// Ratings and reviews: products (verified purchases) and the service of each delivered order.
export interface ReviewView {
  id: number; displayName: string; rating: number; comment?: string | null;
  createdAt: string; updatedAt?: string | null; reply?: string | null; repliedAt?: string | null;
}

export interface ProductReviews {
  itemId: number;
  average: number | null;
  count: number;
  distribution: number[]; // [1-star count, 2-star, 3-star, 4-star, 5-star]
  reviews: ReviewView[];
}

export interface ItemRating { itemId: number; average: number; count: number; }

export interface FeedbackView {
  id: number; displayName: string; serviceRating: number; deliveryRating: number; comment?: string | null;
  createdAt: string; reply?: string | null; repliedAt?: string | null;
}

export interface ServiceReviews {
  serviceAverage: number | null;
  deliveryAverage: number | null;
  count: number;
  productReviews: number;
  productAverage: number | null;
  reviews: FeedbackView[];
}

export interface RateItem { itemId: number; name: string; imagePath?: string | null; delivered: boolean; myRating?: number | null; myComment?: string | null; }
export interface MyFeedback { serviceRating: number; deliveryRating: number; comment?: string | null; }
export interface OrderRating { orderId: number; canRate: boolean; reason?: string | null; items: RateItem[]; feedback?: MyFeedback | null; }

// staff
export interface AdminReview {
  id: number; itemId: number; itemName: string; orderId: number; userEmail: string; displayName: string; rating: number;
  comment?: string | null; hidden: boolean; reply?: string | null; repliedBy?: string | null; createdAt: string; updatedAt?: string | null;
}
export interface AdminFeedback {
  id: number; orderId: number; userEmail: string; displayName: string; serviceRating: number; deliveryRating: number;
  comment?: string | null; riderId?: number | null; riderName?: string | null; hidden: boolean; reply?: string | null;
  repliedBy?: string | null; createdAt: string; updatedAt?: string | null;
}
export interface RiderRating { riderId: number; name: string; average: number; count: number; }
export interface ReviewsOverview { productReviews: AdminReview[]; feedback: AdminFeedback[]; riders: RiderRating[]; }

@Injectable({ providedIn: 'root' })
export class ReviewsService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/reviews`;

  // everyone
  product(itemId: number) {
    return this.http.get<ProductReviews>(`${this.api}/products/${itemId}`);
  }

  summary() {
    return this.http.get<ItemRating[]>(`${this.api}/summary`);
  }

  service() {
    return this.http.get<ServiceReviews>(`${this.api}/service`);
  }

  // the customer
  forOrder(orderId: number) {
    return this.http.get<OrderRating>(`${this.api}/orders/${orderId}`);
  }

  rateProduct(orderId: number, itemId: number, rating: number, comment: string) {
    return this.http.post<RateItem>(`${this.api}/orders/${orderId}/products/${itemId}`, { rating, comment });
  }

  rateService(orderId: number, serviceRating: number, deliveryRating: number, comment: string) {
    return this.http.post<MyFeedback>(`${this.api}/orders/${orderId}/service`, { serviceRating, deliveryRating, comment });
  }

  // staff
  overview() {
    return this.http.get<ReviewsOverview>(`${this.api}/admin`);
  }

  setHidden(kind: 'products' | 'service', id: number, hidden: boolean) {
    return this.http.post(`${this.api}/admin/${kind}/${id}/hidden`, { hidden });
  }

  reply(kind: 'products' | 'service', id: number, reply: string) {
    return this.http.post(`${this.api}/admin/${kind}/${id}/reply`, { reply });
  }
}
