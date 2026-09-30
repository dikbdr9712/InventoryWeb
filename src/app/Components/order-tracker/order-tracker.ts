import { Component, computed, input } from '@angular/core';
import { orderStage } from '../../utils/order-status';

// Shows Placed > Confirmed > Shipped > Delivered.  <app-order-tracker [status]="order.orderStatus" />
@Component({
  selector: 'app-order-tracker',
  templateUrl: './order-tracker.html',
  styleUrl: './order-tracker.css'
})
export class OrderTracker {
  status = input<string | undefined>(undefined);
  steps = ['Placed', 'Confirmed', 'Shipped', 'Delivered'];
  stage = computed(() => orderStage(this.status()));
}
