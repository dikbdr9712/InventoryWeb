import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification, NotificationsService } from '../../services/notifications';

const ICONS: Record<string, string> = {
  ORDER_PLACED: 'fa-receipt',
  ORDER_PAID: 'fa-circle-check',
  RIDER_ASSIGNED: 'fa-motorcycle',
  ON_THE_WAY: 'fa-truck-fast',
  DELIVERED: 'fa-house-circle-check',
  ORDER_CANCELLED: 'fa-ban',
  PAYMENT_TO_CHECK: 'fa-magnifying-glass-dollar',
  PAYMENT_REFUSED: 'fa-circle-xmark',
  PAYMENT_QUESTION: 'fa-circle-question',
  ONLINE_PAYMENT_PROBLEM: 'fa-triangle-exclamation',
  NEW_ORDER: 'fa-box-open',
  PICKED_UP: 'fa-people-carry-box',
  NEW_JOB: 'fa-route',
  EARNED: 'fa-coins',
  PAYOUT: 'fa-building-columns',
  NEW_APPLICATION: 'fa-user-plus',
  APPLICATION_APPROVED: 'fa-circle-check',
  APPLICATION_REFUSED: 'fa-circle-xmark',
  ACCOUNT_SUSPENDED: 'fa-circle-pause'
};

// The bell at the top of the site: what happened to my orders, jobs and money.
@Component({
  selector: 'app-notification-bell',
  template: `
    <div class="bell">
      <button type="button" class="bell-btn" (click)="toggle()" [attr.aria-expanded]="open()"
              [attr.aria-label]="notes.unread() ? 'Notifications, ' + notes.unread() + ' new' : 'Notifications'">
        <i class="fas fa-bell"></i>
        @if (notes.unread() > 0) {
          <span class="bell-count">{{ notes.unread() > 9 ? '9+' : notes.unread() }}</span>
        }
      </button>

      @if (open()) {
        <div class="bell-panel" role="dialog" aria-label="Notifications">
          <div class="bell-head">
            <strong>Notifications</strong>
            @if (notes.unread() > 0) {
              <button type="button" class="bell-all" (click)="notes.markAllRead()">Mark all as read</button>
            }
          </div>
          <ul class="bell-list">
            @for (n of notes.items(); track n.id) {
              <li>
                <button type="button" class="bell-item" [class.unread]="!n.read" (click)="openNote(n)">
                  <i class="fas bell-icon" [class]="'fas bell-icon ' + icon(n.type)"></i>
                  <span class="bell-text">
                    <strong>{{ n.title }}</strong>
                    @if (n.body) { <span class="bell-body">{{ n.body }}</span> }
                    <small>{{ ago(n.createdAt) }}</small>
                  </span>
                  @if (!n.read) { <span class="bell-dot" aria-label="New"></span> }
                </button>
              </li>
            } @empty {
              <li class="bell-empty">
                @if (notes.loading()) {
                  Loading...
                } @else {
                  <i class="fas fa-bell-slash"></i>
                  Nothing yet. Updates about your orders, jobs and money appear here.
                }
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: [`
    .bell { position: relative; }
    .bell-btn {
      position: relative; display: inline-flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border: 0; border-radius: 8px; background: none; color: var(--ink);
      font-size: 1.1rem; cursor: pointer;
    }
    .bell-btn:hover { background: var(--wash); }
    @media (max-width: 480px) { .bell-btn { width: 36px; height: 36px; font-size: 1rem; } } /* phones: the header fits on one row */
    .bell-count {
      position: absolute; top: 0; right: -2px; min-width: 18px; height: 18px; padding: 0 5px;
      border-radius: 999px; background: var(--red); color: #fff; font-size: 0.72rem; font-weight: 700; line-height: 18px;
    }
    .bell-panel {
      position: absolute; right: -48px; top: calc(100% + 10px); z-index: 1100; width: 360px;
      border: 1px solid var(--line); border-radius: 12px; background: #fff; box-shadow: 0 12px 32px rgba(23, 33, 31, 0.16);
      overflow: hidden;
    }
    .bell-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--line); }
    .bell-all { padding: 0; border: 0; background: none; color: var(--green); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
    .bell-list { max-height: min(460px, calc(100vh - 140px)); margin: 0; padding: 0; overflow-y: auto; list-style: none; }
    .bell-item {
      display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 12px 14px;
      border: 0; border-bottom: 1px solid var(--line); background: #fff; color: var(--ink); text-align: left; cursor: pointer;
    }
    .bell-item:hover { background: var(--wash); }
    .bell-item.unread { background: #f4faf7; }
    .bell-icon { width: 20px; margin-top: 3px; color: var(--green); text-align: center; }
    .bell-text { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
    .bell-text strong { font-size: 0.92rem; font-weight: 600; line-height: 1.3; }
    .bell-item.unread .bell-text strong { font-weight: 700; }
    .bell-body {
      display: -webkit-box; overflow: hidden; color: var(--muted); font-size: 0.85rem; line-height: 1.35;
      -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2;
    }
    .bell-text small { color: var(--muted); font-size: 0.75rem; }
    .bell-dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: var(--green); }
    .bell-empty { padding: 28px 18px; color: var(--muted); text-align: center; }
    .bell-empty i { display: block; margin-bottom: 8px; font-size: 1.6rem; }
    @media (max-width: 575px) {
      .bell-panel { position: fixed; left: 8px; right: 8px; top: 64px; width: auto; }
    }
  `]
})
export class NotificationBell {
  notes = inject(NotificationsService);
  private router = inject(Router);
  private el = inject(ElementRef);

  open = signal(false);

  toggle() {
    this.open.update(o => !o);
    if (this.open()) this.notes.load();
  }

  openNote(n: AppNotification) {
    this.notes.markRead(n);
    this.open.set(false);
    if (n.link) this.router.navigateByUrl(n.link);
  }

  icon(type: string) {
    return ICONS[type] ?? 'fa-bell';
  }

  ago(when: string) {
    const seconds = Math.max(0, (Date.now() - new Date(when).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
    const days = Math.floor(seconds / 86400);
    return days === 1 ? 'yesterday' : days < 7 ? `${days} days ago` : new Date(when).toLocaleDateString();
  }

  @HostListener('document:click', ['$event'])
  outside(event: Event) {
    if (this.open() && !this.el.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  escape() {
    this.open.set(false);
  }
}
