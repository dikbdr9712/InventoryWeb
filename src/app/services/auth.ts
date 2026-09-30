import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoginResponse, SignupRequest } from '../models/models';
import { Permission, permissionsFor } from '../utils/permissions';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  isLoggedIn = signal(localStorage.getItem('isLoggedIn') === 'true');
  role = signal(localStorage.getItem('userRole'));

  // ADMIN / MANAGER / CONTROLLER: admin menu, restock, POS, orders...
  isStaff = computed(() => this.isLoggedIn() && ['ADMIN', 'MANAGER', 'CONTROLLER'].includes(this.role() ?? ''));
  // ADMIN / MANAGER only: add and edit items (same as your product.js)
  // ADMIN only: user management
  isAdmin = computed(() => this.isLoggedIn() && this.role() === 'ADMIN');
  canManageItems = computed(() => this.can('items.manage'));

  // Ask for a specific permission instead of checking role names.
  // The table in utils/permissions.ts decides who has what.
  can(permission: Permission): boolean {
    return this.isLoggedIn() && permissionsFor(this.role()).includes(permission);
  }

  email() { return localStorage.getItem('currentUser'); }
  name() { return localStorage.getItem('userName'); }
  phone() { return localStorage.getItem('userPhone'); }

  login(email: string, password: string) {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/api/auth/login`, { email, password })
      .pipe(
        tap(user => {
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('currentUser', user.email);
          localStorage.setItem('userName', user.name);
          localStorage.setItem('userPhone', user.phone);
          localStorage.setItem('userRole', user.role);
          localStorage.setItem('userEmail', user.email);
          this.isLoggedIn.set(true);
          this.role.set(user.role);
        })
      );
  }

  signup(data: SignupRequest) {
    return this.http.post(`${environment.apiUrl}/api/auth/signup`, data, { responseType: 'text' });
  }

  logout() {
    ['isLoggedIn', 'currentUser', 'userName', 'userPhone', 'userRole', 'userEmail']
      .forEach(key => localStorage.removeItem(key));
    this.isLoggedIn.set(false);
    this.role.set(null);
  }
}
