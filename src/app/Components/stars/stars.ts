import { Component, computed, input, model, signal } from '@angular/core';

// Five stars. Shows a rating (halves too), or lets the person pick one when "pick" is set.
//   <app-stars [value]="4.5" />                      showing an average
//   <app-stars pick [(value)]="rating" label="Your rating" />   choosing 1 to 5
@Component({
  selector: 'app-stars',
  template: `
    @if (pick()) {
      <div class="stars pick" [class.big]="size() === 'big'" role="radiogroup" [attr.aria-label]="label()"
           (mouseleave)="hover.set(0)">
        @for (n of five; track n) {
          <button type="button" role="radio" [attr.aria-checked]="value() === n" [attr.aria-label]="n + (n === 1 ? ' star' : ' stars')"
                  [title]="words[n - 1]" (mouseenter)="hover.set(n)" (focus)="hover.set(n)" (blur)="hover.set(0)"
                  (click)="value.set(n)">
            <i class="fa-star" [class.fas]="n <= shown()" [class.far]="n > shown()"></i>
          </button>
        }
        <!-- always there with a fixed width, so the stars do not move while hovering -->
        <span class="word">{{ shown() ? words[shown() - 1] : '' }}</span>
      </div>
    } @else {
      <span class="stars" [class.big]="size() === 'big'" role="img" [attr.aria-label]="(value() ?? 0) + ' out of 5 stars'">
        @for (n of five; track n) {
          <i [class]="icon(n)"></i>
        }
      </span>
    }
  `,
  styles: [`
    :host { display: inline-block; }
    .stars { display: inline-flex; align-items: center; gap: 1px; color: #e2a012; font-size: 0.9rem; line-height: 1; }
    .stars.big { font-size: 1.25rem; gap: 3px; }
    .pick button { padding: 3px; border: 0; background: none; color: #e2a012; font-size: 1.5rem; line-height: 1; cursor: pointer; }
    .pick.big button { font-size: 1.9rem; }
    .pick button:focus-visible { outline: 2px solid var(--green); border-radius: 4px; }
    .pick .far { color: #c9cfcd; }
    .word { display: inline-block; min-width: 5.6em; margin-left: 8px; color: var(--muted); font-size: 0.85rem; font-weight: 600; }
  `]
})
export class Stars {
  value = model<number | null>(null);
  pick = input(false, { transform: (v: boolean | string) => v === '' || v === true || v === 'true' });
  size = input<'normal' | 'big'>('normal');
  label = input('Rating');

  readonly five = [1, 2, 3, 4, 5];
  readonly words = ['Poor', 'Not good', 'OK', 'Good', 'Excellent'];
  hover = signal(0);
  shown = computed(() => this.hover() || (this.value() ?? 0));

  icon(n: number): string {
    const v = this.value() ?? 0;
    if (v >= n) return 'fas fa-star';
    if (v >= n - 0.5) return 'fas fa-star-half-stroke';
    return 'far fa-star';
  }
}
