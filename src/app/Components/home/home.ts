import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ItemService } from '../../services/item';
import { Item } from '../../models/models';

@Component({
  selector: 'app-home',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home implements OnInit, OnDestroy {
  private itemService = inject(ItemService);

  slides = [1, 2, 3, 4, 5].map(n => `Images/cors-${n}.jpg`);
  current = signal(0);
  featured = signal<Item[]>([]);
  private timer?: ReturnType<typeof setInterval>;

  values = [
    {
      icon: 'fa-leaf',
      title: 'Carefully selected',
      text: 'Gentle, natural ingredients, with clear descriptions of what is in each product.'
    },
    {
      icon: 'fa-truck-fast',
      title: 'Fast, careful delivery',
      text: 'Every order is packed with care and sent out as quickly as we can.'
    },
    {
      icon: 'fa-wallet',
      title: 'Simple payment',
      text: 'Pay by bank transfer, or pay in cash when your order arrives.'
    }
  ];

  ngOnInit() {
    // Slide automatically, unless the visitor asked their device for less motion
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      this.timer = setInterval(() => this.next(), 6000);
    }

    // A few real products from the shop
    this.itemService.getAll().subscribe({
      next: items => this.featured.set(items.slice(0, 4)),
      error: () => this.featured.set([]) // the section simply stays hidden
    });
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  next() { this.current.update(i => (i + 1) % this.slides.length); }
  prev() { this.current.update(i => (i - 1 + this.slides.length) % this.slides.length); }
  goTo(i: number) { this.current.set(i); }

  image(item: Item) {
    return this.itemService.imageFor(item);
  }

  discount(item: Item) {
    return this.itemService.discountPercent(item);
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }
}
