import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { NotificationBell } from '../notification-bell/notification-bell';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../services/auth';
import { CartService } from '../../services/cart';
import { AppInstall } from '../../services/app-install';
import { StaffLink, STAFF_GROUPS } from '../../utils/staff-nav';
import { homeFor } from '../../utils/home';

type MenuName = 'account' | null;

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, NotificationBell],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class Navbar {
  auth = inject(AuthService);
  cart = inject(CartService);
  app = inject(AppInstall);
  private router = inject(Router);
  private el = inject(ElementRef);

  // this person's own starting page (My shop, My deliveries, Dashboard, POS...); empty for customers
  home = computed(() => {
    const h = homeFor(this.auth);
    return this.auth.isLoggedIn() && h.path !== '/products' ? h : null;
  });

  drawerOpen = signal(false);
  openMenu = signal<MenuName>(null);
  // On the sign-in and sign-up pages the header's "Sign in" button would only repeat the form below it
  onAuthPage = signal(this.isAuthUrl(this.router.url));

  constructor() {
    // Any page change closes the menus: a click on a link, the browser's back button, a redirect
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(event => {
        this.onAuthPage.set(this.isAuthUrl(event.urlAfterRedirects));
        this.closeAll();
      });
  }

  private isAuthUrl(url: string) {
    return /^\/(login|signup)(\?|$)/.test(url);
  }

  mainLinks = [
    { path: '/', label: 'Home', icon: 'fa-house', exact: true },
    { path: '/products', label: 'Products', icon: 'fa-store', exact: false },
    { path: '/services', label: 'Services', icon: 'fa-hand-holding-heart', exact: false },
    { path: '/orders', label: 'My orders', icon: 'fa-receipt', exact: false },
    { path: '/contact', label: 'Contact', icon: 'fa-envelope', exact: false }
  ];

  // Staff tools (also shown in the staff bar). One shared list: see utils/staff-nav.ts
  manageGroups = STAFF_GROUPS;

  allowed(item: StaffLink): boolean {
    return this.auth.can(item.permission);
  }

  // Only the groups that have something this person may open
  visibleGroups() {
    return this.manageGroups
      .map(g => ({ title: g.title, items: g.items.filter(i => this.allowed(i)) }))
      .filter(g => g.items.length > 0);
  }

  // Customers and visitors are invited to sell or deliver; staff, sellers and riders are not
  canJoin(): boolean {
    return !this.auth.isLoggedIn() || (this.auth.role() ?? 'USER').toUpperCase() === 'USER';
  }

  initials(): string {
    const text = (this.auth.name() || this.auth.email() || '?').trim();
    const parts = text.split(/\s+/);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  roleLabel(): string {
    const role = (this.auth.role() ?? '').toUpperCase();
    const names: Record<string, string> = { USER: 'Customer', RIDER: 'Delivery driver', SELLER: 'Seller' };
    return role ? names[role] ?? role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, ' ') : '';
  }

  toggle(menu: 'account') {
    this.openMenu.update(current => (current === menu ? null : menu));
  }

  openDrawer() {
    this.openMenu.set(null);
    this.drawerOpen.set(true);
    document.body.style.overflow = 'hidden';
  }

  closeDrawer() {
    this.drawerOpen.set(false);
    document.body.style.overflow = '';
  }

  closeAll() {
    this.openMenu.set(null);
    this.closeDrawer();
  }

  signOut() {
    this.auth.logout();
    this.cart.clear(); // the next person at a shared computer starts with an empty cart
    this.closeAll();
    this.router.navigate(['/']);
  }

  // A click anywhere except inside the menu closes it. That includes other links in the header.
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.('.nb-menu')) this.openMenu.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeAll();
  }
}
