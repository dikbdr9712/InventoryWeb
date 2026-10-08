import { Component, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Item } from '../../models/models';
import { ItemService } from '../../services/item';
import { WishHeart } from '../wish-heart/wish-heart';
import { dealEnds } from '../../utils/deals';

// A row of small product cards that scrolls sideways: "You may also like", "Recently viewed", deals.
//   <app-product-row title="Recently viewed" [items]="recent()" link="/products" />
//   <app-product-row title="" [items]="all()" grid />     a grid (a seller's shop)
@Component({
  selector: 'app-product-row',
  imports: [RouterLink, DecimalPipe, WishHeart],
  template: `
    @if (items().length > 0) {
      <section class="row-block" [attr.aria-label]="title() || null">
        @if (title()) {
          <div class="row-head">
            <h2>{{ title() }}</h2>
            @if (link()) { <a [routerLink]="link()" [queryParams]="linkQuery()">See all</a> }
          </div>
        }
        <ul class="row" [class.grid]="grid()">
          @for (item of items(); track item.itemId) {
            <li class="mini">
              <a [routerLink]="['/products', item.itemId]">
                <span class="photo">
                  <img [src]="itemService.imageFor(item)" [alt]="item.itemName" loading="lazy" (error)="noPhoto($event)" />
                  @if (itemService.discountPercent(item) !== null) { <span class="off">{{ itemService.discountPercent(item) }}% off</span> }
                </span>
                <span class="name">{{ item.itemName }}</span>
                <span class="price">
                  Nu. {{ item.sellingPrice | number: '1.2-2' }}
                  @if (itemService.discountPercent(item) !== null) { <s>Nu. {{ item.mrp | number: '1.2-2' }}</s> }
                </span>
                @if (deals() && dealEnds(item.dealEndsAt)) { <span class="ends"><i class="fas fa-clock" aria-hidden="true"></i> {{ dealEnds(item.dealEndsAt) }}</span> }
              </a>
              <app-wish-heart class="heart" [itemId]="item.itemId" [name]="item.itemName" />
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: [`
    .row-block { margin: 28px 0 8px; }
    .row-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .row-head h2 { margin: 0; font-size: 1.2rem; }
    .row-head a { font-weight: 600; white-space: nowrap; }
    .row {
      display: grid; grid-auto-flow: column; grid-auto-columns: minmax(148px, 172px); gap: 12px;
      margin: 0; padding: 2px 2px 10px; list-style: none; overflow-x: auto; scroll-snap-type: x proximity;
      overscroll-behavior-x: contain;
    }
    .row.grid { grid-auto-flow: row; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); overflow: visible; }
    .mini { position: relative; scroll-snap-align: start; }
    .mini > a {
      display: flex; flex-direction: column; gap: 4px; height: 100%; padding: 8px; border: 1px solid var(--line);
      border-radius: var(--radius); background: var(--paper); color: var(--ink); text-decoration: none;
    }
    .mini > a:hover { border-color: #9fc8ba; }
    .photo { position: relative; display: block; aspect-ratio: 1 / 1; border-radius: 8px; background: var(--wash); overflow: hidden; }
    .photo img { width: 100%; height: 100%; object-fit: contain; }
    .off { position: absolute; top: 6px; left: 6px; padding: 1px 7px; border-radius: 999px; background: var(--red); color: #fff; font-size: 0.72rem; font-weight: 700; }
    .name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 0.88rem; line-height: 1.3; }
    .price { margin-top: auto; font-weight: 700; font-size: 0.92rem; }
    .price s { margin-left: 4px; color: var(--muted); font-weight: 400; font-size: 0.8rem; }
    .heart { position: absolute; top: 14px; right: 14px; }
    .ends { color: var(--red); font-size: 0.78rem; font-weight: 600; }
  `]
})
export class ProductRow {
  itemService = inject(ItemService);
  title = input.required<string>();
  items = input<Item[]>([]);
  link = input<string | null>(null);
  linkQuery = input<Record<string, string>>({});
  deals = input(false, { transform: (v: boolean | string) => v === '' || v === true }); // show when each deal ends
  readonly dealEnds = dealEnds;
  grid = input(false, { transform: (v: boolean | string) => v === '' || v === true }); // all products in rows, no sideways scroll

  noPhoto(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }
}
