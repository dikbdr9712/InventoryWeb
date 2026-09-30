import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { UserService } from '../../services/user';
import { AuthService } from '../../services/auth';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { AppUser } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { focusFirstError } from '../../utils/focus-error';
import { Permission, ROLE_PERMISSIONS } from '../../utils/permissions';

interface UserRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  roleName: string;
  roleId: number;
}

// The role ids are the ones your server uses
const ROLES = [
  { id: 1, name: 'ADMIN', label: 'Admin' },
  { id: 2, name: 'MANAGER', label: 'Manager' },
  { id: 3, name: 'CONTROLLER', label: 'Controller' },
  { id: 4, name: 'USER', label: 'Customer' }
];

// Plain-language names for the permissions in utils/permissions.ts
const PERMISSION_LABELS: Record<Permission, string> = {
  'orders.view': 'See the order list',
  'orders.fulfil': 'Confirm, ship and deliver orders',
  'payments.verify': 'Verify payments',
  'items.manage': 'Add and edit products',
  'stock.restock': 'Restock',
  'pos.use': 'Use the point of sale',
  'reports.view': 'See the sales dashboard',
  'messages.view': 'Read customer messages',
  'users.manage': 'Manage users and roles'
};

@Component({
  selector: 'app-user-management',
  imports: [RouterLink, FormsModule],
  templateUrl: './user-management.html',
  styleUrl: './user-management.css'
})
export class UserManagement implements OnInit {
  private userService = inject(UserService);
  private auth = inject(AuthService);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);
  private host = inject(ElementRef);

  roles = ROLES;
  permissionRows = (Object.keys(PERMISSION_LABELS) as Permission[]).map(key => ({ key, label: PERMISSION_LABELS[key] }));

  users = signal<UserRow[]>([]);
  loading = signal(true);
  busyId = signal<number | null>(null);

  searchTerm = signal('');
  roleFilter = signal(''); // '' = everyone

  // Page state after the server check
  accessDenied = signal<{ name: string; role: string } | null>(null);
  notLoggedIn = signal(false);

  // ---------- Add a user ----------
  showAdd = signal(false);
  adding = signal(false);
  addSubmitted = signal(false);
  addError = signal('');
  showNewPassword = signal(false);
  newUser = { name: '', email: '', phone: '', password: '', roleId: 4 }; // 4 = Customer
  // Shown once after an account is created, because the password cannot be looked up later
  createdInfo = signal<{ name: string; email: string; password: string; roleLabel: string } | null>(null);

  // The role picked in each row's menu, by user id (not saved until the person presses Save)
  picked = signal<Record<number, number>>({});

  counts = computed(() => {
    const result: Record<string, number> = { '': this.users().length };
    for (const role of ROLES) result[role.name] = this.users().filter(u => u.roleName === role.name).length;
    return result;
  });

  visible = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const role = this.roleFilter();
    return this.users().filter(u =>
      (!role || u.roleName === role) &&
      (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term) || u.phone.includes(term))
    );
  });

  ngOnInit() {
    // Double-check with the server session (the route guard only checks the browser)
    this.userService.getMe().subscribe({
      next: me => {
        const role = this.roleName(me.role);
        if (role !== 'ADMIN') {
          this.accessDenied.set({ name: me.name, role });
          this.loading.set(false);
          return;
        }
        this.load();
      },
      error: () => {
        this.notLoggedIn.set(true);
        this.loading.set(false);
      }
    });
  }

  load() {
    this.userService.getAll().subscribe({
      next: users => {
        const rows = users.map(u => {
          const roleName = this.roleName(u.role);
          return {
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone ?? '',
            roleName,
            roleId: ROLES.find(r => r.name === roleName)?.id ?? 4
          };
        });
        this.users.set(rows);
        this.picked.set({});
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.toasts.error('We could not load the users: ' + errorText(err));
      }
    });
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  roleLabel(roleName: string): string {
    return ROLES.find(r => r.name === roleName)?.label ?? roleName;
  }

  roleHas(roleName: string, permission: Permission): boolean {
    return (ROLE_PERMISSIONS[roleName] ?? []).includes(permission);
  }

  // You cannot change your own role: it is an easy way to lock yourself out
  isSelf(user: UserRow): boolean {
    return user.email.toLowerCase() === (this.auth.email() ?? '').toLowerCase();
  }

  selectedRoleId(user: UserRow): number {
    return this.picked()[user.id] ?? user.roleId;
  }

  changed(user: UserRow): boolean {
    return this.selectedRoleId(user) !== user.roleId;
  }

  pick(user: UserRow, value: string) {
    this.picked.update(all => ({ ...all, [user.id]: Number(value) }));
  }

  async save(user: UserRow) {
    const newRole = ROLES.find(r => r.id === this.selectedRoleId(user));
    if (!newRole || !this.changed(user)) return;

    const toAdmin = newRole.name === 'ADMIN';
    const fromAdmin = user.roleName === 'ADMIN';
    const extra = toAdmin
      ? ' Admins can see and change everything, including other people\'s roles.'
      : fromAdmin
        ? ' They will lose admin access.'
        : '';

    const ok = await this.confirm.ask({
      title: 'Change role',
      message: `Change ${user.name} from ${this.roleLabel(user.roleName)} to ${newRole.label}?${extra}`,
      confirmLabel: 'Change role',
      danger: toAdmin || fromAdmin
    });
    if (!ok) return;

    this.busyId.set(user.id);
    this.userService.updateRole(user.id, newRole.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toasts.success(`${user.name} is now ${newRole.label}.`);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.toasts.error('We could not change the role: ' + errorText(err));
      }
    });
  }

  // ---------- Add a user: methods ----------
  toggleAdd() {
    this.showAdd.update(open => !open);
    this.addError.set('');
    this.addSubmitted.set(false);
  }

  addErrors() {
    const e: { name?: string; email?: string; phone?: string; password?: string } = {};
    const u = this.newUser;
    if (!u.name.trim()) e.name = 'Enter their full name.';
    if (!u.email.trim()) e.email = 'Enter their email address.';
    else if (!/^\S+@\S+\.\S+$/.test(u.email.trim())) e.email = 'Enter a valid email address.';
    if (!/^[0-9]{8}$/.test(u.phone.trim())) e.phone = 'Enter an 8-digit phone number.';
    if (u.password.length < 6) e.password = 'Use at least 6 characters.';
    return e;
  }

  // A random password without look-alike characters (no 0/O, 1/l/I)
  generatePassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const random = crypto.getRandomValues(new Uint32Array(10));
    this.newUser.password = Array.from(random, n => chars[n % chars.length]).join('');
    this.showNewPassword.set(true); // so the admin can read it
  }

  async createUser() {
    if (this.adding()) return;

    this.addError.set('');
    this.addSubmitted.set(true);
    if (Object.keys(this.addErrors()).length > 0) {
      focusFirstError(this.host.nativeElement);
      return;
    }

    const role = ROLES.find(r => r.id === this.newUser.roleId) ?? ROLES[3];
    const name = this.newUser.name.trim();
    const email = this.newUser.email.trim();
    const phone = this.newUser.phone.trim();
    const password = this.newUser.password;

    if (role.name === 'ADMIN') {
      const ok = await this.confirm.ask({
        title: 'Create an administrator',
        message: `${name} will be able to see and change everything, including other people's roles. Create the account?`,
        confirmLabel: 'Create administrator',
        danger: true
      });
      if (!ok) return;
    }

    this.adding.set(true);

    // Step 1: create the account (it starts as a Customer)
    this.auth.signup({ name, email, phone, password }).subscribe({
      next: () => {
        // Step 2: if they need a different role, find the new account and set it
        if (role.name === 'USER') {
          this.finishCreate(name, email, password, role.label);
          return;
        }
        this.userService.getAll().subscribe({
          next: users => {
            const created = users.find(u => u.email.toLowerCase() === email.toLowerCase());
            if (!created) {
              this.adding.set(false);
              this.toasts.error(`The account was created, but we could not find it to set the ${role.label} role. Set it in the list below.`);
              this.load();
              return;
            }
            this.userService.updateRole(created.id, role.id).subscribe({
              next: () => this.finishCreate(name, email, password, role.label),
              error: (err: HttpErrorResponse) => {
                this.adding.set(false);
                this.toasts.error(`The account was created, but the ${role.label} role was not set: ${errorText(err)}`);
                this.load();
              }
            });
          },
          error: () => {
            this.adding.set(false);
            this.toasts.error(`The account was created, but we could not set the ${role.label} role. Set it in the list below.`);
            this.load();
          }
        });
      },
      error: (err: HttpErrorResponse) => {
        this.adding.set(false);
        this.addError.set(err.status === 0
          ? errorText(err)
          : 'We could not create the account. ' + errorText(err));
      }
    });
  }

  private finishCreate(name: string, email: string, password: string, roleLabel: string) {
    this.adding.set(false);
    this.createdInfo.set({ name, email, password, roleLabel });
    this.newUser = { name: '', email: '', phone: '', password: '', roleId: 4 };
    this.addSubmitted.set(false);
    this.showNewPassword.set(false);
    this.showAdd.set(false);
    this.load(); // the new person appears in the list
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  copyPassword(password: string) {
    navigator.clipboard?.writeText(password).then(
      () => this.toasts.success('Password copied'),
      () => this.toasts.error('Could not copy. Please select and copy it by hand.')
    );
  }

  // The API may send the role as "ADMIN" or as { name: "ADMIN" }
  private roleName(role: AppUser['role']): string {
    if (role && typeof role === 'object') return (role.name || 'UNKNOWN').toUpperCase();
    return String(role || 'UNKNOWN').trim().toUpperCase();
  }
}
