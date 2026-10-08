import { Component, effect, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ExtraPhoto, PhotoScope, ProductPhotoService } from '../../services/product-photos';
import { ItemService } from '../../services/item';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { errorText } from '../../utils/http-error';

// More photos of a saved product (up to 4 besides the main photo). Changes are saved at once.
//   <app-photo-manager [itemId]="id" scope="staff" (mainChanged)="preview.set($event)" />
@Component({
  selector: 'app-photo-manager',
  template: `
    <div class="pm">
      <p class="pm-title">More photos <small>{{ photos().length }} of {{ max }}</small></p>
      @if (photos().length > 0) {
        <ul class="pm-list">
          @for (p of photos(); track p.id) {
            <li>
              <img [src]="itemService.imageUrl(p.path)" alt="" />
              <span class="pm-actions">
                <button type="button" class="pm-btn" (click)="makeMain(p)" [disabled]="busy()" title="Use as the main photo" aria-label="Use as the main photo"><i class="fas fa-star"></i></button>
                <button type="button" class="pm-btn danger" (click)="remove(p)" [disabled]="busy()" title="Remove" aria-label="Remove this photo"><i class="fas fa-trash"></i></button>
              </span>
            </li>
          }
        </ul>
      }
      @if (photos().length < max) {
        <input #file type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only" [id]="inputId" (change)="add(file)" />
        <label [for]="inputId" class="btn btn-outline-secondary btn-sm" [class.disabled]="busy()">
          <i class="fas fa-plus"></i> {{ busy() ? 'Uploading...' : 'Add a photo' }}
        </label>
      }
      <p class="pm-hint">Show the product from other sides, in use, or its label. The star makes a photo the main one.</p>
    </div>
  `,
  styles: [`
    .pm { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
    .pm-title { margin: 0 0 8px; font-weight: 600; }
    .pm-title small { color: var(--muted); font-weight: 400; }
    .pm-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; margin: 0 0 10px; padding: 0; list-style: none; }
    .pm-list li { position: relative; aspect-ratio: 1 / 1; border: 1px solid var(--line); border-radius: 8px; background: var(--wash); overflow: hidden; }
    .pm-list img { width: 100%; height: 100%; object-fit: contain; }
    .pm-actions { position: absolute; right: 3px; bottom: 3px; display: flex; gap: 3px; }
    .pm-btn { width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: rgba(255,255,255,0.92); color: var(--ink); font-size: 0.72rem; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .pm-btn:hover { color: var(--green); }
    .pm-btn.danger:hover { color: var(--red); }
    .pm-hint { margin: 8px 0 0; color: var(--muted); font-size: 0.8rem; }
    label.disabled { pointer-events: none; opacity: 0.6; }
  `]
})
export class PhotoManager {
  private api = inject(ProductPhotoService);
  itemService = inject(ItemService);
  private toasts = inject(ToastService);
  private confirm = inject(ConfirmService);

  itemId = input.required<number>();
  scope = input<PhotoScope>('staff');
  mainChanged = output<string>(); // the new main photo's path

  readonly max = 4;
  readonly inputId = `pm-${Math.random().toString(36).slice(2, 8)}`;
  photos = signal<ExtraPhoto[]>([]);
  busy = signal(false);

  constructor() {
    effect(() => {
      const id = this.itemId();
      if (id) this.api.list(this.scope(), id).subscribe({ next: list => this.photos.set(list), error: () => this.photos.set([]) });
    });
  }

  add(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { this.toasts.error('The photo is too big (at most 5 MB).'); return; }
    this.run(this.api.add(this.scope(), this.itemId(), file), 'Photo added.');
  }

  async remove(p: ExtraPhoto) {
    if (!await this.confirm.ask({ title: 'Remove this photo?', message: 'It is deleted from the product.', confirmLabel: 'Remove', danger: true })) return;
    this.run(this.api.remove(this.scope(), this.itemId(), p.id), 'Photo removed.');
  }

  makeMain(p: ExtraPhoto) {
    const newMain = p.path;
    this.run(this.api.makeMain(this.scope(), this.itemId(), p.id), 'That is the main photo now.', () => this.mainChanged.emit(newMain));
  }

  private run(call: ReturnType<ProductPhotoService['add']>, done: string, after?: () => void) {
    this.busy.set(true);
    call.subscribe({
      next: list => { this.busy.set(false); this.photos.set(list); this.toasts.success(done); after?.(); },
      error: (err: HttpErrorResponse) => { this.busy.set(false); this.toasts.error(errorText(err)); }
    });
  }
}
