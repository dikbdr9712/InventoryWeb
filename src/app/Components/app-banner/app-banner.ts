import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AppInstall } from '../../services/app-install';

// Pages where a banner at the bottom would cover something important (checkout, the counter, staff work)
const QUIET_PAGES = ['/app', '/login', '/signup', '/forgot-password', '/reset-password', '/cart', '/payment', '/pay/',
  '/order-success', '/receipt', '/pos', '/admin', '/restock', '/order-verification', '/products/new', '/products/edit'];

// At the bottom of the screen: "a new version is ready", or (on phones) "get the app".
@Component({
  selector: 'app-app-banner',
  imports: [RouterLink],
  templateUrl: './app-banner.html',
  styleUrl: './app-banner.css'
})
export class AppBanner {
  app = inject(AppInstall);
  private router = inject(Router);

  private url = toSignal(this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url });
  private closed = signal(!this.app.bannerWanted());

  showInstall = computed(() => !this.closed() && !this.app.installed()
    && !QUIET_PAGES.some(p => this.url().startsWith(p)));

  async install() {
    if (await this.app.install()) this.closed.set(true);
  }

  notNow() {
    this.app.notNow();
    this.closed.set(true);
  }
}
