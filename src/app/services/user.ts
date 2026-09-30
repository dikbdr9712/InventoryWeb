import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AppUser } from '../models/models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);

  // Who is logged in, according to the server session
  getMe() {
    return this.http.get<AppUser>(`${environment.apiUrl}/api/auth/me`);
  }

  getAll() {
    return this.http.get<AppUser[]>(`${environment.apiUrl}/api/admin/users`);
  }

  updateRole(userId: number, roleId: number) {
    return this.http.put(`${environment.apiUrl}/api/admin/users/${userId}/role`, null, {
      params: { roleId: String(roleId) },
      responseType: 'text'
    });
  }
}
