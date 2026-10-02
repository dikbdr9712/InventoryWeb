import { DeliverySize } from '../models/models';

// Map points without a map library: the phone's GPS, numbers copied from Google Maps, and links that open
// Google Maps (on a phone, the Maps app) for directions.

export interface LatLng {
  latitude: number;
  longitude: number;
}

// Ask the browser for the current position. Works on https (and localhost); the person must allow it.
export function currentPosition(): Promise<LatLng & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser cannot share a location. Choose your area instead.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: round(p.coords.latitude), longitude: round(p.coords.longitude), accuracy: Math.round(p.coords.accuracy) }),
      err => reject(new Error(
        err.code === err.PERMISSION_DENIED
          ? 'Location is blocked for this site. Allow it in the browser settings, or choose your area instead.'
          : err.code === err.TIMEOUT
            ? 'Finding your location took too long. Try again outside or near a window, or choose your area.'
            : 'Your location could not be found. Choose your area instead.'
      )),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

// Reads a point from what people copy out of Google Maps:
//   "27.4728, 89.6393"   (right-click on the map, or the numbers at the top of a dropped pin)
//   https://www.google.com/maps/place/.../@27.4728,89.6393,17z     https://maps.google.com/?q=27.4728,89.6393
//   ...!3d27.4728!4d89.6393
// Short links (maps.app.goo.gl) do not contain the numbers, so they cannot be read.
export function parseLatLng(text: string): LatLng | null {
  const t = (text || '').trim();
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/
  ];
  for (const pattern of patterns) {
    const m = t.match(pattern);
    if (m) {
      const latitude = Number(m[1]);
      const longitude = Number(m[2]);
      if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && !(latitude === 0 && longitude === 0)) {
        return { latitude: round(latitude), longitude: round(longitude) };
      }
    }
  }
  return null;
}

// Opens the point in Google Maps
export function mapLink(latitude?: number | null, longitude?: number | null): string | null {
  return latitude == null || longitude == null ? null : `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

// Directions to a point (from where the phone is now, or from a start point)
export function directionsLink(to: LatLng | null, from?: LatLng | null): string | null {
  if (!to) return null;
  const origin = from ? `&origin=${from.latitude},${from.longitude}` : '';
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${to.latitude},${to.longitude}`;
}

export function point(latitude?: number | null, longitude?: number | null): LatLng | null {
  return latitude == null || longitude == null ? null : { latitude, longitude };
}

// 5 decimals is about 1 metre: enough for a door, and it hides nothing more precise than needed
function round(value: number) {
  return Math.round(value * 100000) / 100000;
}

// ---------- Delivery sizes ----------
export const DELIVERY_SIZES: { value: DeliverySize; label: string; vehicle: string; hint: string; icon: string }[] = [
  { value: 'SMALL', label: 'Small', vehicle: 'Any rider', hint: 'Fits in a delivery bag: medicines, cosmetics, a phone', icon: 'fa-bag-shopping' },
  { value: 'MEDIUM', label: 'Medium', vehicle: 'Motorbike', hint: 'A shoe box or small appliance, still fine on a motorbike', icon: 'fa-box' },
  { value: 'LARGE', label: 'Large', vehicle: 'Car', hint: 'Needs a car: microwave, TV, chair, a big carton', icon: 'fa-car-side' },
  { value: 'BULKY', label: 'Bulky', vehicle: 'Pickup truck', hint: 'Needs a pickup and two people: washing machine, fridge, furniture', icon: 'fa-truck-pickup' }
];

export function sizeInfo(size?: DeliverySize | null) {
  return DELIVERY_SIZES.find(s => s.value === size) ?? DELIVERY_SIZES[0];
}
