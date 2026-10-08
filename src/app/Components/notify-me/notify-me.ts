import { Component, computed, inject, input } from '@angular/core';
import { StockAlertService } from '../../services/stock-alerts';

// "Notify me" on a sold-out product: the customer is told (bell and email) when it is back.
//   <app-notify-me [itemId]="item.itemId" [name]="item.itemName" />          full button
//   <app-notify-me [itemId]="item.itemId" [name]="item.itemName" small />    on a product card
@Component({
  selector: 'app-notify-me',
  template: `
    <button type="button" class="btn notify" [class.btn-sm]="small()" [class.on]="waiting()" [attr.aria-pressed]="waiting()"
            (click)="toggle($event)" [title]="waiting() ? 'We will tell you when it is back. Tap to cancel.' : 'Tell me when it is back'">
      <i class="fa-bell" [class.fas]="waiting()" [class.far]="!waiting()" aria-hidden="true"></i>
      {{ waiting() ? (small() ? 'We will tell you' : 'We will tell you when it is back') : (small() ? 'Notify me' : 'Notify me when it is back') }}
    </button>
  `,
  styles: [`
    :host { display: inline-flex; }
    .notify {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%;
      border: 1px solid var(--green); background: var(--paper); color: var(--green); font-weight: 600;
    }
    .notify:hover { background: var(--green-soft); color: var(--green-deep); }
    .notify.on { border-color: var(--saffron); background: var(--saffron-soft); color: #7a5200; }
  `]
})
export class NotifyMe {
  private alerts = inject(StockAlertService);
  itemId = input.required<number>();
  name = input('this product');
  small = input(false, { transform: (v: boolean | string) => v === '' || v === true });

  waiting = computed(() => this.alerts.ids().has(this.itemId()));

  toggle(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.alerts.toggle(this.itemId(), this.name());
  }
}
