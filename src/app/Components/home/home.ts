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

  // Pictures drawn for DP DrukBazaars (public/Images/art)
  slides = [
    { src: 'Images/art/banner-market.svg', alt: 'A market street with Bhutanese-style shops and shoppers carrying bags' },
    { src: 'Images/art/banner-delivery.svg', alt: 'A rider on a scooter taking a package up a mountain road to a house' },
    { src: 'Images/art/banner-pay.svg', alt: 'Paying from your own bank account on a phone, kept safe' },
    { src: 'Images/art/banner-track.svg', alt: 'A map with the route of an order, and its steps from packed to delivered' }
  ];
  current = signal(0);
  // Only the first photo is downloaded with the page; each other photo is fetched just before it is shown
  ready = signal<boolean[]>(this.slides.map((_, i) => i === 0));
  featured = signal<Item[]>([]);
  private timer?: ReturnType<typeof setInterval>;
  private warmup?: ReturnType<typeof setTimeout>;

  values = [
    {
      icon: 'fa-store',
      title: 'Trusted sellers',
      text: 'Products from DP DrukBazaars and checked local sellers, with clear descriptions and reviews from real buyers.'
    },
    {
      icon: 'fa-truck-fast',
      title: 'Fast, careful delivery',
      text: 'Every order is packed with care and sent out as quickly as we can.'
    },
    {
      icon: 'fa-wallet',
      title: 'Simple payment',
      text: 'Pay online from your bank account through the RMA Payment Gateway. Your order is confirmed at once.'
    }
  ];

  ngOnInit() {
    // Slide automatically, unless the visitor asked their device for less motion
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      this.timer = setInterval(() => this.next(), 6000);
    }
    // once the page has settled, get the second photo ready so the first slide change is smooth
    this.warmup = setTimeout(() => this.prepare(1), 2500);

    // A few real products from the shop
    this.itemService.getAll().subscribe({
      next: items => this.featured.set(items.slice(0, 4)),
      error: () => this.featured.set([]) // the section simply stays hidden
    });
  }

  ngOnDestroy() {
    clearInterval(this.timer);
    clearTimeout(this.warmup);
  }

  next() { this.goTo((this.current() + 1) % this.slides.length); }
  prev() { this.goTo((this.current() - 1 + this.slides.length) % this.slides.length); }
  goTo(i: number) {
    this.prepare(i);
    this.current.set(i);
    this.prepare((i + 1) % this.slides.length);
  }

  private prepare(i: number) {
    if (!this.ready()[i]) this.ready.update(r => r.map((on, j) => on || j === i));
  }

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
