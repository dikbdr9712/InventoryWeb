import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../services/auth';
import { STAFF_GROUPS, StaffLink } from '../../utils/staff-nav';

// The dark bar under the header. It only shows for people who have staff tools, and only the tools their role allows.
// A group with several tools is a small menu (so the bar always fits on one line); a group with one tool is a link.
@Component({
  selector: 'app-staff-bar',
  imports: [RouterLink],
  templateUrl: './staff-bar.html',
  styleUrl: './staff-bar.css'
})
export class StaffBar {
  private auth = inject(AuthService);
  private router = inject(Router);
  private host = inject(ElementRef);

  open = signal<string | null>(null);   // the group whose menu is open
  url = signal(this.router.url);

  groups = computed(() =>
    STAFF_GROUPS
      .map(group => ({ ...group, items: group.items.filter(item => this.auth.can(item.permission)) }))
      .filter(group => group.items.length > 0)
  );

  constructor() {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(e => {
        this.url.set((e as NavigationEnd).urlAfterRedirects);
        this.open.set(null);
      });
  }

  isActive(item: StaffLink): boolean {
    const [path, query = ''] = this.url().split('?');
    if (path !== item.path && !path.startsWith(item.path + '/')) return false;
    // "Sales history" and "Cash drawers" share a page: the query decides which one is meant
    const wantsDrawers = !!item.query?.['view'];
    return wantsDrawers === query.includes('view=drawers');
  }

  groupActive(items: StaffLink[]): boolean {
    return items.some(i => this.isActive(i));
  }

  toggle(title: string) {
    this.open.update(current => (current === title ? null : title));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!this.host.nativeElement.contains(event.target)) this.open.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.open.set(null);
  }
}
