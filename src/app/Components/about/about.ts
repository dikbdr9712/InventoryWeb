import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AboutPage, SiteService, TeamPerson } from '../../services/site';
import { ShopDetails } from '../../services/shop-details';

// Shown when the server cannot be reached; the server has the same built-in wording (SiteService.DEFAULTS).
const FALLBACK: AboutPage = {
  intro: 'DP DrukBazaars is an online marketplace from Bhutan. We connect people with products they can trust, '
    + 'and with the local sellers and riders who bring them to their door.',
  mission: 'Our mission is to make online shopping in Bhutan simple, safe and reliable: easy ordering, safe payment '
    + 'from your own bank account, and delivery you can follow from start to finish. We help local businesses '
    + 'and makers reach more customers.',
  vision: 'Our vision is a marketplace where every local business in Bhutan can sell to customers across the '
    + 'country, and every customer can shop with confidence, wherever they live.',
  showNumbers: false,
  team: []
};

// The About page. Its texts, the live numbers and the team are managed by staff in Website > About page.
@Component({
  selector: 'app-about',
  imports: [RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css'
})
export class About implements OnInit {
  private site = inject(SiteService);

  readonly shop = inject(ShopDetails);
  page = signal<AboutPage | null>(null);

  // only the numbers worth showing (a 0 would only look odd)
  numbers = computed(() => {
    const n = this.page()?.numbers;
    if (!this.page()?.showNumbers || !n) return [];
    const list: { value: string; label: string; icon: string }[] = [];
    if (n.products > 0) list.push({ value: n.products.toLocaleString('en-IN'), label: n.products === 1 ? 'Product to choose from' : 'Products to choose from', icon: 'fa-bag-shopping' });
    if (n.sellers > 0) list.push({ value: n.sellers.toLocaleString('en-IN'), label: n.sellers === 1 ? 'Local seller' : 'Local sellers', icon: 'fa-store' });
    if (n.delivered > 0) list.push({ value: n.delivered.toLocaleString('en-IN'), label: n.delivered === 1 ? 'Order delivered' : 'Orders delivered', icon: 'fa-truck-fast' });
    if (n.rating && n.ratings > 0) list.push({ value: Number(n.rating).toFixed(1), label: `Average rating, from ${n.ratings} ${n.ratings === 1 ? 'review' : 'reviews'}`, icon: 'fa-star' });
    return list;
  });

  readonly ways = [
    { icon: 'fa-bag-shopping', title: 'Shop', text: 'Order in a few taps, pay from your own bank account, and follow your order until it reaches your door.', link: '/products', action: 'Start shopping' },
    { icon: 'fa-store', title: 'Sell', text: 'List your products and reach customers across Bhutan. We take the payment, collect the package and deliver it.', link: '/sell', action: 'Sell with us' },
    { icon: 'fa-motorcycle', title: 'Deliver', text: 'Choose delivery jobs near you, take each package from the shop to the customer, and earn for every delivery.', link: '/deliver', action: 'Deliver with us' }
  ];

  ngOnInit() {
    this.site.about().subscribe({
      next: p => this.page.set(p),
      error: () => this.page.set(FALLBACK)
    });
  }

  photo(person: TeamPerson) {
    return this.site.photoUrl(person.photo);
  }

  // If a photo is missing, show the person's initials instead of a broken picture
  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  hide(event: Event) {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
