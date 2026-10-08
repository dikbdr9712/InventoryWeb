import { Component, ElementRef, afterNextRender, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Item } from '../../models/models';
import { ItemService } from '../../services/item';

interface Suggestion { key: string; kind: 'item' | 'category'; label: string; hint: string; image?: string; itemId?: number; }

let nextId = 0;

// Search with suggestions while typing: matching products (open one directly) and categories.
//   <app-search-box [(value)]="term" (search)="go($event)" />
// Enter without choosing a suggestion sends (search) with the words typed.
@Component({
  selector: 'app-search-box',
  template: `
    <form class="sb" role="search" (submit)="submit($event)">
      <i class="fas fa-magnifying-glass sb-icon" aria-hidden="true"></i>
      <input #box type="search" class="form-control" [placeholder]="placeholder()" [value]="value()" autocomplete="off"
             role="combobox" aria-autocomplete="list" [attr.aria-label]="label()" [attr.aria-expanded]="showList()"
             [attr.aria-controls]="listId" [attr.aria-activedescendant]="active() >= 0 ? listId + '-' + active() : null"
             (input)="typed(box.value)" (focus)="opened()" (blur)="closeSoon()" (keydown)="key($event)" />
      @if (showList()) {
        <ul class="sb-list" role="listbox" [id]="listId" aria-label="Suggestions">
          @for (s of suggestions(); track s.key; let i = $index) {
            <li role="option" [id]="listId + '-' + i" [attr.aria-selected]="i === active()" [class.on]="i === active()"
                (mousedown)="$event.preventDefault()" (click)="pick(s)">
              @if (s.image) { <img [src]="s.image" alt="" (error)="noPhoto($event)" /> } @else { <i class="fas fa-tag" aria-hidden="true"></i> }
              <span class="sb-label">{{ s.label }}</span>
              <small>{{ s.hint }}</small>
            </li>
          }
        </ul>
      }
    </form>
  `,
  styles: [`
    :host { display: block; }
    .sb { position: relative; }
    .sb-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
    .sb input { padding-left: 36px; height: 42px; border-radius: 10px; }
    .sb-list {
      position: absolute; z-index: 1100; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 4px;
      list-style: none; border: 1px solid var(--line); border-radius: 10px; background: var(--paper);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14); max-height: 360px; overflow-y: auto;
    }
    .sb-list li { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; cursor: pointer; min-width: 0; }
    .sb-list li.on, .sb-list li:hover { background: var(--green-soft); }
    .sb-list img { flex: none; width: 34px; height: 34px; object-fit: contain; border-radius: 6px; background: var(--wash); }
    .sb-list li > i { flex: none; width: 34px; text-align: center; color: var(--green); }
    .sb-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sb-list small { flex: none; color: var(--muted); }
  `]
})
export class SearchBox {
  private itemService = inject(ItemService);
  private router = inject(Router);
  private box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  value = model('');
  placeholder = input('Search products');
  label = input('Search products');
  autofocus = input(false);
  search = output<string>();
  picked = output<void>();

  readonly listId = `sb-${nextId++}`;
  private items = signal<Item[]>([]);
  private loaded = false;
  open = signal(false);
  active = signal(-1);

  suggestions = computed<Suggestion[]>(() => {
    const term = this.value().trim().toLowerCase();
    if (!term) return [];
    const forSale = this.items().filter(i => this.itemService.forSale(i));
    const products = forSale
      .filter(i => (i.itemName || '').toLowerCase().includes(term))
      .sort((a, b) => Number(!(a.itemName || '').toLowerCase().startsWith(term)) - Number(!(b.itemName || '').toLowerCase().startsWith(term))
        || (a.itemName || '').localeCompare(b.itemName || ''))
      .slice(0, 6)
      .map(i => ({ key: 'i' + i.itemId, kind: 'item' as const, label: i.itemName, itemId: i.itemId,
        hint: i.sellingPrice != null ? 'Nu. ' + Number(i.sellingPrice).toFixed(2) : '', image: this.itemService.imageFor(i) }));
    const categories = [...new Set(forSale.map(i => (i.category || '').trim()).filter(c => c && c.toLowerCase().includes(term)))]
      .slice(0, 3)
      .map(c => ({ key: 'c' + c, kind: 'category' as const, label: c, hint: 'Category' }));
    return [...categories, ...products];
  });
  showList = computed(() => this.open() && this.suggestions().length > 0);

  constructor() {
    afterNextRender(() => {
      if (this.autofocus()) this.box().nativeElement.focus();
    });
  }

  opened() {
    this.open.set(true);
    if (!this.loaded) {
      this.loaded = true;
      this.itemService.catalog().subscribe({ next: list => this.items.set(list), error: () => (this.loaded = false) });
    }
  }

  typed(text: string) {
    this.value.set(text);
    this.active.set(-1);
    this.opened();
  }

  key(event: KeyboardEvent) {
    const count = this.suggestions().length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.open.set(true);
      this.active.set((this.active() + 1) % count);
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.active.set(this.active() <= 0 ? count - 1 : this.active() - 1);
    } else if (event.key === 'Escape') {
      this.open.set(false);
      this.active.set(-1);
    }
  }

  submit(event: Event) {
    event.preventDefault();
    const chosen = this.suggestions()[this.active()];
    if (this.showList() && chosen) {
      this.pick(chosen);
      return;
    }
    this.open.set(false);
    this.search.emit(this.value().trim());
  }

  pick(s: Suggestion) {
    this.open.set(false);
    this.active.set(-1);
    if (s.kind === 'item') this.router.navigate(['/products', s.itemId]);
    else {
      // on the product list, keep the other filters; from anywhere else, start fresh
      const onList = this.router.url.split('?')[0] === '/products';
      this.router.navigate(['/products'], { queryParams: { category: s.label, q: null }, queryParamsHandling: onList ? 'merge' : '' });
    }
    this.picked.emit();
  }

  closeSoon() {
    setTimeout(() => this.open.set(false), 120); // let a click on a suggestion land first
  }

  noPhoto(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }
}
