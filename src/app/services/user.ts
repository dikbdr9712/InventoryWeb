import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AdminUser, AppUser, AuditEntry, PermissionInfo, RoleInfo } from '../models/models';

// People and access. Everything under /api/admin needs "Manage users and roles"; the server enforces the safety rules.
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/admin`;

  // Who is logged in, according to the server session
  getMe() {
    return this.http.get<AppUser>(`${environment.apiUrl}/api/auth/me`);
  }

  // ---------- People ----------
  getAll() {
    return this.http.get<AdminUser[]>(`${this.api}/users`);
  }

  create(user: { name: string; email: string; phone: string; password: string; roleId: number }) {
    return this.http.post<AdminUser>(`${this.api}/users`, user);
  }

  setUserRole(userId: number, roleId: number) {
    return this.http.put<AdminUser>(`${this.api}/users/${userId}/role`, null, { params: { roleId: String(roleId) } });
  }

  // Seller / delivery driver without an application: the admin gives their details, the account is approved at once
  makeSeller(userId: number, form: object) {
    return this.http.post<AdminUser>(`${this.api}/users/${userId}/make-seller`, form);
  }

  makeDriver(userId: number, form: object) {
    return this.http.post<AdminUser>(`${this.api}/users/${userId}/make-driver`, form);
  }

  setActive(userId: number, active: boolean) {
    return this.http.put<AdminUser>(`${this.api}/users/${userId}/active`, { active });
  }

  // Correct a person's name, sign-in email or phone (a new email signs them out; they sign in with the new one)
  changeDetails(userId: number, details: { name: string; email: string; phone: string }) {
    return this.http.put<AdminUser>(`${this.api}/users/${userId}`, details);
  }

  resetPassword(userId: number) {
    return this.http.post<{ password: string }>(`${this.api}/users/${userId}/reset-password`, null);
  }

  // ---------- Roles and permissions ----------
  permissions() {
    return this.http.get<PermissionInfo[]>(`${this.api}/permissions`);
  }

  roles() {
    return this.http.get<RoleInfo[]>(`${this.api}/roles`);
  }

  createRole(role: { name: string; description: string; permissions: string[] }) {
    return this.http.post<RoleInfo>(`${this.api}/roles`, role);
  }

  updateRole(id: number, role: { name?: string; description: string; permissions: string[] }) {
    return this.http.put<RoleInfo>(`${this.api}/roles/${id}`, role);
  }

  deleteRole(id: number) {
    return this.http.delete<void>(`${this.api}/roles/${id}`);
  }

  // ---------- Activity ----------
  audit(limit = 200) {
    return this.http.get<AuditEntry[]>(`${this.api}/audit`, { params: { limit: String(limit) } });
  }
}
