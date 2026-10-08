import { Component, computed, inject, input } from '@angular/core';
import { WishlistService } from '../../services/wishlist';

// The heart that saves a product to the wishlist (and takes it out again).
//   <app-wish-heart [itemId]="item.itemId" [name]="item.itemName" />            round, over a photo
//   <app-wish-heart [itemId]="item.itemId" [name]="item.itemName" labelled />   a button with "Save" / "Saved"
@Component({
  selector: 'app-wish-heart',
  template: `
    <button type="button" class="wish" [class.on]="saved()" [class.labelled]="labelled()" (click)="toggle($event)"
            [attr.aria-pressed]="saved()" [attr.aria-label]="labelled() ? null : (saved() ? 'Saved in your wishlist: ' : 'Save to your wishlist: ') + name()"
            [title]="saved() ? 'Saved in your wishlist' : 'Save for later'">
      <i [class]="saved() ? 'fas fa-heart' : 'far fa-heart'" aria-hidden="true"></i>
      @if (labelled()) { <span>{{ saved() ? 'Saved' : 'Save' }}</span> }
    </button>
  `,
  styles: [`
    :host { display: inline-flex; }
    .wish {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      width: 34px; height: 34px; padding: 0; border: 1px solid var(--line); border-radius: 999px;
      background: var(--paper); color: var(--muted); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
      font-size: 0.95rem; cursor: pointer; transition: transform 0.12s ease;
    }
    .wish:hover { color: var(--red); }
    .wish:active { transform: scale(0.9); }
    .wish.on { color: var(--red); border-color: #f3c2bd; }
    .wish:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
    .wish.labelled { width: auto; height: auto; padding: 0.5rem 1rem; border-radius: 0.3rem; box-shadow: none; font-weight: 600; }
    .wish.labelled.on { background: var(--red-soft); }
  `]
})
export class WishHeart {
  private wishlist = inject(WishlistService);
  itemId = input.required<number>();
  name = input('This product');
  labelled = input(false, { transform: (v: boolean | string) => v === '' || v === true });

  saved = computed(() => this.wishlist.ids().has(this.itemId()));

  toggle(event: Event) {
    event.preventDefault(); // it may sit on a product card's link
    event.stopPropagation();
    this.wishlist.toggle(this.itemId(), this.name());
  }
}
