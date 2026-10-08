import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ExtraPhoto { id: number; path: string; }
export type PhotoScope = 'staff' | 'seller';

// More photos of a product (besides its main photo; 5 in all). Staff manage any product; a seller their own.
@Injectable({ providedIn: 'root' })
export class ProductPhotoService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  private base(scope: PhotoScope, itemId: number) {
    return scope === 'staff' ? `${this.api}/api/items/${itemId}/photos` : `${this.api}/api/seller/items/${itemId}/photos`;
  }

  list(scope: PhotoScope, itemId: number) {
    return scope === 'staff'
      ? this.http.get<{ photos?: ExtraPhoto[] }>(`${this.api}/api/items/${itemId}`).pipe(map(i => i.photos ?? []))
      : this.http.get<ExtraPhoto[]>(this.base(scope, itemId));
  }

  add(scope: PhotoScope, itemId: number, file: File) {
    const data = new FormData();
    data.append('photo', file);
    return this.http.post<ExtraPhoto[]>(this.base(scope, itemId), data);
  }

  remove(scope: PhotoScope, itemId: number, photoId: number) {
    return this.http.delete<ExtraPhoto[]>(`${this.base(scope, itemId)}/${photoId}`);
  }

  makeMain(scope: PhotoScope, itemId: number, photoId: number) {
    return this.http.post<ExtraPhoto[]>(`${this.base(scope, itemId)}/${photoId}/main`, null);
  }
}
