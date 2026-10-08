import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoginResponse, SignupRequest } from '../models/models';
import { Permission, permissionsFor } from '../utils/permissions';

export type ResetMethod = 'email' | 'sms';
export interface ResetWays { email: boolean; sms: boolean; }

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

  // Read from the browser's storage. Reading `details` first makes the header and menus update when they change.
  private details = signal(0);
  email() { this.details(); return localStorage.getItem('currentUser'); }
  name() { this.details(); return localStorage.getItem('userName'); }
  phone() { this.details(); return localStorage.getItem('userPhone'); }
  // their profile photo's address, or null (then their initials are shown)
  photo(): string | null {
    this.details();
    const path = localStorage.getItem('userPhoto');
    return path ? (path.startsWith('http') ? path : environment.imageBase + path) : null;
  }

  // keeps what the server says about this person
  private remember(user: LoginResponse) {
    localStorage.setItem('currentUser', user.email);
    localStorage.setItem('userEmail', user.email);
    localStorage.setItem('userName', user.name);
    localStorage.setItem('userPhone', user.phone ?? '');
    if (user.photoPath) localStorage.setItem('userPhoto', user.photoPath);
    else localStorage.removeItem('userPhoto');
    this.details.update(n => n + 1);
  }

  // My profile: name, phone and email (a new email needs the current password)
  updateProfile(change: { name: string; email: string; phone: string; currentPassword?: string }) {
    return this.http.put<LoginResponse>(`${environment.apiUrl}/api/auth/me`, change).pipe(tap(user => this.remember(user)));
  }

  uploadPhoto(file: Blob) {
    const data = new FormData();
    data.append('photo', file, 'photo.jpg');
    return this.http.post<LoginResponse>(`${environment.apiUrl}/api/auth/me/photo`, data).pipe(tap(user => this.remember(user)));
  }

  removePhoto() {
    return this.http.delete<LoginResponse>(`${environment.apiUrl}/api/auth/me/photo`).pipe(tap(user => this.remember(user)));
  }

  login(email: string, password: string) {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/api/auth/login`, { email, password })
      .pipe(
        tap(user => {
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('userRole', user.role);
          this.remember(user);
          this.isLoggedIn.set(true);
          this.role.set(user.role);
          this.setPermissions(user.permissions);
        })
      );
  }

  // ---------- Forgot password ----------
  // 1. a 6-digit code by email or text message, 2. the code gives a one-time ticket, 3. the new password.
  // The answers are the same whether or not the email or phone number has an account.

  // Which ways can send the code now (a way the server cannot use is not offered; neither = ask the shop)
  resetWays() {
    return this.http.get<ResetWays>(`${environment.apiUrl}/api/auth/forgot-password`);
  }

  sendResetCode(method: ResetMethod, to: string) {
    return this.http.post<{ message: string; resendAfter: number }>(`${environment.apiUrl}/api/auth/forgot-password`,
      method === 'email' ? { method, email: to } : { method, phone: to });
  }

  verifyResetCode(method: ResetMethod, to: string, code: string) {
    return this.http.post<{ token: string }>(`${environment.apiUrl}/api/auth/forgot-password/verify`,
      method === 'email' ? { method, email: to, code } : { method, phone: to, code });
  }

  checkResetLink(token: string) {
    return this.http.get<{ valid: boolean }>(`${environment.apiUrl}/api/auth/reset-password/check`, { params: { token } });
  }

  // With the ticket (after the code) or the token from the email link. Gives back the account's email, to sign in with.
  resetPassword(token: string, newPassword: string) {
    return this.http.post<{ message: string; email?: string }>(`${environment.apiUrl}/api/auth/reset-password`, { token, newPassword });
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
        this.remember(user);
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
    ['isLoggedIn', 'currentUser', 'userName', 'userPhone', 'userRole', 'userEmail', 'userPermissions', 'userPhoto']
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
