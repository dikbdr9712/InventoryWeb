import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoginResponse, SignupRequest } from '../models/models';
import { Permission, permissionsFor } from '../utils/permissions';

function readPermissions(): string[] | null {
  try {
    const raw = localStorage.getItem('userPermissions');
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  isLoggedIn = signal(localStorage.getItem('isLoggedIn') === 'true');
  role = signal(localStorage.getItem('userRole'));
  // What the server says this person may do (null = not known yet: fall back to the built-in table)
  permissions = signal<string[] | null>(readPermissions());

  // Works in the shop (any staff tool), whatever the role is called (custom roles such as CASHIER count too)
  isStaff = computed(() => {
    if (!this.isLoggedIn()) return false;
    const list = this.permissions() ?? permissionsFor(this.role());
    return list.some(p => p !== 'seller.portal' && p !== 'rider.portal');
  });
  isAdmin = computed(() => this.isLoggedIn() && this.role() === 'ADMIN');
  canManageItems = computed(() => this.can('items.manage'));

  // Ask for a specific permission instead of checking role names.
  // The table in utils/permissions.ts decides who has what.
  can(permission: Permission): boolean {
    if (!this.isLoggedIn()) return false;
    const fromServer = this.permissions();
    return fromServer ? fromServer.includes(permission) : permissionsFor(this.role()).includes(permission);
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
          this.setPermissions(user.permissions);
        })
      );
  }

  // ---------- Forgot password ----------
  // The answer is the same whether or not the email has an account
  // Can the server send the reset email? (No email account set up = ask the shop instead.)
  resetByEmailAvailable() {
    return this.http.get<{ email: boolean }>(`${environment.apiUrl}/api/auth/forgot-password`);
  }

  forgotPassword(email: string) {
    return this.http.post<{ message: string }>(`${environment.apiUrl}/api/auth/forgot-password`, { email });
  }

  checkResetLink(token: string) {
    return this.http.get<{ valid: boolean }>(`${environment.apiUrl}/api/auth/reset-password/check`, { params: { token } });
  }

  resetPassword(token: string, newPassword: string) {
    return this.http.post<{ message: string }>(`${environment.apiUrl}/api/auth/reset-password`, { token, newPassword });
  }

  signup(data: SignupRequest) {
    return this.http.post(`${environment.apiUrl}/api/auth/signup`, data, { responseType: 'text' });
  }

  // Ask the server who we are. The role can change while signed in (an admin approves a seller or rider),
  // so this brings the menus up to date without signing out and in again.
  refresh() {
    return this.http.get<LoginResponse>(`${environment.apiUrl}/api/auth/me`).pipe(
      tap(user => {
        if (!this.isLoggedIn()) return;
        localStorage.setItem('userRole', user.role);
        localStorage.setItem('userName', user.name);
        this.role.set(user.role);
        this.setPermissions(user.permissions);
      })
    );
  }

  // The server checks the current password and the length rule
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post(`${environment.apiUrl}/api/auth/change-password`, { currentPassword, newPassword });
  }

  logout() {
    ['isLoggedIn', 'currentUser', 'userName', 'userPhone', 'userRole', 'userEmail', 'userPermissions']
      .forEach(key => localStorage.removeItem(key));
    this.isLoggedIn.set(false);
    this.role.set(null);
    this.permissions.set(null);
  }

  private setPermissions(list: string[] | undefined) {
    if (!list) return;
    localStorage.setItem('userPermissions', JSON.stringify(list));
    this.permissions.set(list);
  }
}
