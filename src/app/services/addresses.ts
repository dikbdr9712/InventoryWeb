import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { DeliveryPoint } from '../models/models';

export interface SavedAddress {
  id: number;
  label: string;          // Home, Office, ...
  phone: string;
  address: string;
  areaId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  pointLabel?: string | null;
  isDefault: boolean;
}

export interface AddressForm {
  label: string;
  phone: string;
  address: string;
  areaId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  pointLabel?: string | null;
  makeDefault?: boolean;
}

// The signed-in person's saved delivery addresses (at most 10; the default one first).
@Injectable({ providedIn: 'root' })
export class AddressService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/addresses`;

  list() {
    return this.http.get<SavedAddress[]>(this.api);
  }

  add(form: AddressForm) {
    return this.http.post<SavedAddress>(this.api, form);
  }

  update(id: number, form: AddressForm) {
    return this.http.put<SavedAddress>(`${this.api}/${id}`, form);
  }

  makeDefault(id: number) {
    return this.http.post<SavedAddress[]>(`${this.api}/${id}/default`, null);
  }

  remove(id: number) {
    return this.http.delete<SavedAddress[]>(`${this.api}/${id}`);
  }

  // the place on the map, as checkout's location picker holds it
  static pointOf(a: SavedAddress): DeliveryPoint | null {
    if (a.areaId) return { areaId: a.areaId, label: a.pointLabel ?? 'Saved area' };
    if (a.latitude != null && a.longitude != null) return { latitude: a.latitude, longitude: a.longitude, label: a.pointLabel ?? 'Saved location' };
    return null;
  }

  // the form fields for a place on the map
  static fromPoint(p: DeliveryPoint | null): Pick<AddressForm, 'areaId' | 'latitude' | 'longitude' | 'pointLabel'> {
    if (!p) return { areaId: null, latitude: null, longitude: null, pointLabel: null };
    return p.areaId
      ? { areaId: p.areaId, latitude: null, longitude: null, pointLabel: p.label ?? null }
      : { areaId: null, latitude: p.latitude ?? null, longitude: p.longitude ?? null, pointLabel: p.label ?? null };
  }
}
