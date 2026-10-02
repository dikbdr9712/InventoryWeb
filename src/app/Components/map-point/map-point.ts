import { Component, input, model, signal } from '@angular/core';
import { LatLng, currentPosition, mapLink, parseLatLng } from '../../utils/location';

// Choose one point on the map without a map: "use my current location" (when standing there), or paste the
// numbers / link from Google Maps. Sends the new point out; the page around it decides when to save.
@Component({
  selector: 'app-map-point',
  template: `
    <div class="mp">
      @if (point(); as p) {
        <p class="mp-set">
          <i class="fas fa-location-dot"></i>
          <span>{{ p.latitude }}, {{ p.longitude }}</span>
          <a [href]="link(p)" target="_blank" rel="noopener">Check on the map <i class="fas fa-arrow-up-right-from-square"></i></a>
        </p>
      } @else {
        <p class="mp-none"><i class="fas fa-location-dot"></i> {{ emptyText() }}</p>
      }
      <div class="mp-actions">
        <button type="button" class="btn btn-sm btn-secondary" (click)="gps()" [disabled]="locating()">
          @if (locating()) {
            <span class="spinner-border spinner-border-sm" role="status"></span> Finding...
          } @else {
            <i class="fas fa-location-crosshairs"></i> Use my current location
          }
        </button>
        <button type="button" class="btn btn-sm btn-secondary" (click)="pasting.set(!pasting())" [attr.aria-expanded]="pasting()">
          <i class="fas fa-paste"></i> Paste from Google Maps
        </button>
      </div>
      @if (pasting()) {
        <div class="mp-paste">
          <input #box class="form-control" placeholder="27.4728, 89.6393 or a Google Maps link" aria-label="Map point"
                 (keydown.enter)="$event.preventDefault(); paste(box.value)" />
          <button type="button" class="btn btn-sm btn-primary" (click)="paste(box.value)">Use</button>
        </div>
        <p class="mp-help">
          In Google Maps, press and hold the exact spot (phone) or right-click it (computer), then copy the two numbers
          that appear, or copy the page link.
        </p>
      }
      @if (error()) {
        <p class="mp-err" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styles: [`
    .mp { display: flex; flex-direction: column; gap: 8px; }
    .mp-set, .mp-none { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 0; }
    .mp-set { color: var(--green-deep); font-weight: 600; }
    .mp-set a { font-weight: 600; font-size: 0.88rem; }
    .mp-none { color: #7a5200; }
    .mp-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .mp-paste { display: flex; gap: 8px; }
    .mp-paste input { flex: 1; min-width: 0; }
    .mp-help { margin: 0; color: var(--muted); font-size: 0.8rem; line-height: 1.4; }
    .mp-err { margin: 0; color: var(--red); font-size: 0.88rem; }
  `]
})
export class MapPoint {
  point = model<LatLng | null>(null);
  emptyText = input('Not set yet');

  locating = signal(false);
  pasting = signal(false);
  error = signal('');

  link(p: LatLng) {
    return mapLink(p.latitude, p.longitude);
  }

  async gps() {
    this.error.set('');
    this.locating.set(true);
    try {
      const here = await currentPosition();
      this.point.set({ latitude: here.latitude, longitude: here.longitude });
      if (here.accuracy > 100) {
        this.error.set(`Your phone is only sure to about ${here.accuracy} m. Check it on the map, or paste the exact spot.`);
      }
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.locating.set(false);
    }
  }

  paste(text: string) {
    const p = parseLatLng(text);
    if (!p) {
      this.error.set('Those are not map numbers. Paste something like "27.4728, 89.6393". Short links (maps.app.goo.gl) do not work.');
      return;
    }
    this.error.set('');
    this.pasting.set(false);
    this.point.set(p);
  }
}
