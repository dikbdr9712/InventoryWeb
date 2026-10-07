import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LegalService } from '../../services/legal';
import { LegalTerms, TermsType } from '../../models/models';
import { TermsText } from '../terms-text/terms-text';

// /terms (customers), /terms/seller, /terms/driver. Add ?v=2 to read an older version.
@Component({
  selector: 'app-terms-page',
  imports: [DatePipe, RouterLink, TermsText],
  template: `
    <div class="page narrow">
      @if (terms(); as t) {
        <div class="page-head">
          <div>
            <h1>{{ t.title }}</h1>
            <p>Version {{ t.version }} · in effect since {{ t.publishedAt | date: 'd MMMM y' }}</p>
          </div>
          <button type="button" class="btn btn-secondary no-print" (click)="print()"><i class="fas fa-print"></i> Print</button>
        </div>
        @if (isOld()) {
          <div class="alert alert-info no-print">This is an older version. <a [routerLink]="[]">Read the current version</a>.</div>
        }
        <article class="panel doc"><app-terms-text [body]="t.body" [hideTitle]="true" /></article>
        <nav class="others no-print" aria-label="Other agreements">
          <a routerLink="/terms">Terms of Use and Privacy</a>
          <a routerLink="/terms/seller">Seller Agreement</a>
          <a routerLink="/terms/driver">Driver Agreement</a>
        </nav>
      } @else if (error()) {
        <div class="empty-state"><i class="fas fa-file-circle-question"></i>{{ error() }}</div>
      } @else {
        <p class="muted">Loading...</p>
      }
    </div>`,
  styles: [`
    .narrow { max-width: 860px; }
    .doc { padding: 28px 32px; }
    .others { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 18px; font-weight: 600; }
    .muted { color: var(--muted); }
    @media (max-width: 600px) { .doc { padding: 18px 16px; } }
    @media print {
      .no-print { display: none !important; }
      .doc { border: 0; box-shadow: none; padding: 0; }
    }
  `]
})
export class TermsPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private legal = inject(LegalService);

  terms = signal<LegalTerms | null>(null);
  error = signal('');
  isOld = signal(false);
  private originalTitle = document.title; // put back when leaving, so other pages do not keep the agreement's name

  ngOnInit() {
    this.route.paramMap.subscribe(() => this.load());
    this.route.queryParamMap.subscribe(() => this.load());
  }

  private load() {
    const slug = (this.route.snapshot.paramMap.get('type') ?? '').toLowerCase();
    const type: TermsType = slug === 'seller' ? 'SELLER' : slug === 'driver' || slug === 'rider' ? 'RIDER' : 'CUSTOMER';
    const v = Number(this.route.snapshot.queryParamMap.get('v'));
    this.error.set('');
    const request = v > 0 ? this.legal.version(type, v) : this.legal.current(type);
    request.subscribe({
      next: t => {
        this.terms.set(t);
        this.isOld.set(v > 0);
        if (t?.title) document.title = t.title + ' · DP DrukBazaars';
      },
      error: () => this.error.set('This agreement could not be loaded. Please try again later.')
    });
  }

  ngOnDestroy() {
    document.title = this.originalTitle;
  }

  print() {
    window.print();
  }
}
