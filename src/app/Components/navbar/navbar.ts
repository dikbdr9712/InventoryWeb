import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../services/auth';
import { CartService } from '../../services/cart';
import { StaffLink, STAFF_GROUPS } from '../../utils/staff-nav';

type MenuName = 'account' | null;

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class Navbar {
  auth = inject(AuthService);
  cart = inject(CartService);
  private router = inject(Router);
  private el = inject(ElementRef);

  drawerOpen = signal(false);
  openMenu = signal<MenuName>(null);

  constructor() {
    // Any page change closes the menus: a click on a link, the browser's back button, a redirect
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.closeAll());
  }

  mainLinks = [
    { path: '/', label: 'Home', exact: true },
    { path: '/products', label: 'Products', exact: false },
    { path: '/services', label: 'Services', exact: false },
    { path: '/orders', label: 'My orders', exact: false },
    { path: '/contact', label: 'Contact', exact: false }
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

  initials(): string {
    const text = (this.auth.name() || this.auth.email() || '?').trim();
    const parts = text.split(/\s+/);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  roleLabel(): string {
    const role = this.auth.role() ?? '';
    return role ? role.charAt(0) + role.slice(1).toLowerCase() : '';
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
