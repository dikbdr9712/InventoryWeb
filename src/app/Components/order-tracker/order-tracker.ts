import { Component, computed, input } from '@angular/core';
import { orderStage } from '../../utils/order-status';

// Shows Placed > Confirmed > Shipped > Delivered.  <app-order-tracker [status]="order.orderStatus" />
// A "Pick up myself" order ([pickup]="true") shows Placed > Confirmed > Collected.
@Component({
  selector: 'app-order-tracker',
  templateUrl: './order-tracker.html',
  styleUrl: './order-tracker.css'
})
export class OrderTracker {
  status = input<string | undefined>(undefined);
  pickup = input(false);
  steps = computed(() => this.pickup() ? ['Placed', 'Confirmed', 'Collected'] : ['Placed', 'Confirmed', 'Shipped', 'Delivered']);
  stage = computed(() => {
    const stage = orderStage(this.status());
    return this.pickup() && stage === 3 ? 2 : stage;
  });
}
