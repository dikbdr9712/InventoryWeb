import { Component, OnInit, computed, inject, model, signal } from '@angular/core';
import { DeliveryService } from '../../services/delivery';
import { DeliveryArea, DeliveryPoint } from '../../models/models';
import { currentPosition } from '../../utils/location';

const REMEMBER_KEY = 'deliveryPoint';

// "Where should we deliver?" for checkout: the phone's location, or one of the delivery areas the shop set up.
// The delivery price depends on it. The choice is remembered on this device for the next order.
@Component({
  selector: 'app-delivery-location',
  template: `
    <div class="loc">
      <span class="loc-label">Delivery location</span>
      @if (point(); as p) {
        <div class="loc-set">
          <i class="fas" [class.fa-location-crosshairs]="!p.areaId" [class.fa-map-location-dot]="!!p.areaId"></i>
          <span>{{ p.label }}</span>
          <button type="button" class="loc-change" (click)="clear()">Change</button>
        </div>
      } @else {
        <button type="button" class="btn btn-outline-primary loc-gps" (click)="useGps()" [disabled]="locating()">
          @if (locating()) {
            <span class="spinner-border spinner-border-sm" role="status"></span> Finding your location...
          } @else {
            <i class="fas fa-location-crosshairs"></i> Use my current location
          }
        </button>
        @if (areas().length > 0) {
          <div class="loc-or"><span>or</span></div>
          <select #areaBox class="custom-select" aria-label="Choose your area" (change)="chooseArea(areaBox.value)">
            <option value="">Choose your area...</option>
            @for (town of towns(); track town.name) {
              <optgroup [label]="town.name">
                @for (a of town.areas; track a.id) {
                  <option [value]="a.id">{{ a.name }}</option>
                }
              </optgroup>
            }
          </select>
        }
        @if (error()) {
          <p class="loc-err" role="alert">{{ error() }}</p>
        }
      }
      <p class="loc-hint">
        <i class="fas fa-shield-halved"></i>
        Used to work out the distance and delivery price. Only the rider who takes your order sees it.
      </p>
    </div>
  `,
  styles: [`
    .loc { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
    .loc-label { font-weight: 600; font-size: 0.92rem; }
    .loc-gps { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; }
    .loc-or { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 0.82rem; }
    .loc-or::before, .loc-or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
    .loc-set {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      border: 1px solid #b9dccd; border-radius: 8px; background: var(--green-soft); color: var(--green-deep); font-weight: 600;
    }
    .loc-set span { flex: 1; min-width: 0; }
    .loc-change { padding: 0; border: 0; background: none; color: var(--green); font-weight: 600; text-decoration: underline; cursor: pointer; }
    .loc-err { margin: 0; color: var(--red); font-size: 0.88rem; }
    .loc-hint { margin: 0; color: var(--muted); font-size: 0.8rem; line-height: 1.4; }
    .loc-hint i { margin-right: 4px; color: var(--green); }
  `]
})
export class DeliveryLocation implements OnInit {
  private delivery = inject(DeliveryService);

  point = model<DeliveryPoint | null>(null);

  areas = signal<DeliveryArea[]>([]);
  locating = signal(false);
  error = signal('');

  towns = computed(() => {
    const byTown = new Map<string, DeliveryArea[]>();
    for (const a of this.areas()) byTown.set(a.town, [...(byTown.get(a.town) ?? []), a]);
    return [...byTown.entries()].map(([name, areas]) => ({ name, areas }));
  });

  ngOnInit() {
    this.delivery.areas().subscribe({ next: list => this.areas.set(list), error: () => this.areas.set([]) });
    if (!this.point()) {
      const saved = remembered();
      if (saved) this.point.set(saved);
    }
  }

  async useGps() {
    this.error.set('');
    this.locating.set(true);
    try {
      const here = await currentPosition();
      const accuracy = here.accuracy > 0 && here.accuracy < 5000 ? ` (within about ${here.accuracy} m)` : '';
      this.set({ latitude: here.latitude, longitude: here.longitude, label: 'Your current location' + accuracy });
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.locating.set(false);
    }
  }

  chooseArea(value: string) {
    const area = this.areas().find(a => a.id === Number(value));
    if (area) this.set({ areaId: area.id, label: `${area.name}, ${area.town}` });
  }

  clear() {
    this.point.set(null);
    try { localStorage.removeItem(REMEMBER_KEY); } catch { /* storage blocked: nothing to forget */ }
  }

  private set(p: DeliveryPoint) {
    this.point.set(p);
    try { localStorage.setItem(REMEMBER_KEY, JSON.stringify(p)); } catch { /* storage blocked: just not remembered */ }
  }
}

function remembered(): DeliveryPoint | null {
  try {
    const p = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? 'null');
    return p && (p.areaId || (typeof p.latitude === 'number' && typeof p.longitude === 'number')) ? p : null;
  } catch {
    return null;
  }
}
