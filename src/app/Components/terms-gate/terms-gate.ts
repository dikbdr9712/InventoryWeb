import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { LegalService } from '../../services/legal';
import { ToastService } from '../../services/toast';
import { LegalTerms, TermsType } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { TermsText } from '../terms-text/terms-text';

// Shown instead of a seller's or driver's dashboard when a new version of their agreement must be accepted.
@Component({
  selector: 'app-terms-gate',
  imports: [DatePipe, FormsModule, RouterLink, TermsText],
  template: `
    <section class="panel gate">
      @if (terms(); as t) {
        <span class="icon"><i class="fas fa-file-signature"></i></span>
        <h2>Please accept the updated {{ t.title }}</h2>
        <p class="muted">Version {{ t.version }}, in effect since {{ t.publishedAt | date: 'd MMMM y' }}.
          You need to accept it to continue using your dashboard.</p>
        @if (t.changeSummary) {
          <p class="changes"><strong>What changed:</strong> {{ t.changeSummary }}</p>
        }
        <div class="scroll" tabindex="0" aria-label="Agreement text"><app-terms-text [body]="t.body" /></div>
        <label class="agree">
          <input type="checkbox" [(ngModel)]="agreed" name="agreed" />
          <span>I have read and agree to the {{ t.title }} (version {{ t.version }}).</span>
        </label>
        <div class="actions">
          <button type="button" class="btn btn-primary" [disabled]="!agreed || saving()" (click)="accept(t)">
            {{ saving() ? 'Saving...' : 'Accept and continue' }}
          </button>
          <a class="btn btn-secondary" [routerLink]="type() === 'SELLER' ? '/terms/seller' : '/terms/driver'" target="_blank">Open full page</a>
          <a class="btn btn-link" routerLink="/contact">Questions? Contact us</a>
        </div>
      } @else if (loadError()) {
        <p class="muted">The agreement could not be loaded. {{ loadError() }}</p>
        <button type="button" class="btn btn-primary" (click)="ngOnInit()"><i class="fas fa-rotate"></i> Try again</button>
      } @else {
        <p class="muted">Loading the agreement...</p>
      }
    </section>`,
  styles: [`
    .gate { max-width: 820px; margin: 0 auto; padding: 24px; }
    .icon { display: inline-flex; width: 52px; height: 52px; align-items: center; justify-content: center; border-radius: 50%;
            background: var(--saffron-soft); color: #7a5200; font-size: 1.4rem; margin-bottom: 8px; }
    h2 { margin: 0 0 6px; font-size: 1.35rem; }
    .muted { color: var(--muted); }
    .changes { padding: 10px 12px; border-radius: 8px; background: var(--blue-soft); color: var(--blue); }
    .scroll { max-height: 46vh; overflow-y: auto; padding: 14px 16px; border: 1px solid var(--line); border-radius: 10px;
              background: var(--wash); margin: 12px 0; }
    .agree { display: flex; gap: 10px; align-items: flex-start; font-weight: 600; cursor: pointer; }
    .agree input { width: 20px; height: 20px; margin-top: 2px; accent-color: var(--green); flex: none; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
  `]
})
export class TermsGate implements OnInit {
  private legal = inject(LegalService);
  private toasts = inject(ToastService);

  type = input.required<TermsType>();
  accepted = output<void>();

  terms = signal<LegalTerms | null>(null);
  saving = signal(false);
  loadError = signal('');
  agreed = false;

  ngOnInit() {
    this.loadError.set('');
    this.legal.current(this.type()).subscribe({
      next: t => this.terms.set(t),
      error: (err: HttpErrorResponse) => this.loadError.set(err.status === 0 ? 'The server is not answering right now.' : errorText(err))
    });
  }

  accept(t: LegalTerms) {
    this.saving.set(true);
    this.legal.accept(this.type(), t.version).subscribe({
      next: () => {
        this.saving.set(false);
        this.toasts.success('Thank you. You can continue.');
        this.accepted.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toasts.error(errorText(err));
        this.legal.current(this.type()).subscribe({ next: latest => this.terms.set(latest) }); // maybe a newer version appeared
      }
    });
  }
}
