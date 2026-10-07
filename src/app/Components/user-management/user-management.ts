import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { UserService } from '../../services/user';
import { AuthService } from '../../services/auth';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { AdminUser, AuditEntry, PermissionInfo, RoleInfo } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { focusFirstError } from '../../utils/focus-error';

type Tab = 'people' | 'roles' | 'activity';

interface RoleDraft {
  id: number | null;     // null = a new role
  name: string;
  description: string;
  permissions: Set<string>;
}

// An older server sends the role as an object and no 'active' flag: read both shapes the same way
function normalizeUser(raw: AdminUser & { role?: { id?: number; name?: string } | string | null }): AdminUser {
  const role = raw.role;
  const roleName = raw.roleName ?? (role && typeof role === 'object' ? role.name ?? null : (role as string | null) ?? null);
  const roleId = raw.roleId ?? (role && typeof role === 'object' ? role.id ?? null : null);
  return { ...raw, roleName: roleName ? roleName.toUpperCase() : null, roleId, active: raw.active !== false };
}

// Roles that come from Marketplace approval, not from this screen
const PARTNER_ROLES = ['SELLER', 'RIDER'];

// People, what each role may do (tick boxes), and a log of who changed what.
// The server enforces every rule shown here; the screen only explains them.
@Component({
  selector: 'app-user-management',
  imports: [RouterLink, FormsModule, DatePipe, LowerCasePipe],
  templateUrl: './user-management.html',
  styleUrl: './user-management.css'
})
export class UserManagement implements OnInit {
  private userService = inject(UserService);
  auth = inject(AuthService);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);
  private host = inject(ElementRef);

  tab = signal<Tab>('people');
  loading = signal(true);
  loadError = signal('');
  serverOutdated = signal(false); // the running server is older than this screen (needs a restart)

  users = signal<AdminUser[]>([]);
  roles = signal<RoleInfo[]>([]);
  catalog = signal<PermissionInfo[]>([]);
  audit = signal<AuditEntry[]>([]);
  busyId = signal<number | null>(null);

  // ---------- People: filters ----------
  searchTerm = signal('');
  roleFilter = signal('');               // '' = everyone
  statusFilter = signal<'all' | 'active' | 'off'>('all');

  myEmail = (this.auth.email() ?? '').toLowerCase();
  iAmAdmin = computed(() => (this.auth.role() ?? '').toUpperCase() === 'ADMIN');

  // every role can be chosen for an existing person; Seller / Delivery driver ask for their details when needed
  assignableRoles = computed(() => this.roles());
  // "Add person" creates staff or customers; sellers and drivers start as a customer and then get their details
  newUserRoles = computed(() => this.roles().filter(r => !PARTNER_ROLES.includes(r.name.toUpperCase())));

  // ---------- Making someone a seller or delivery driver ----------
  partnerFor = signal<{ user: AdminUser; type: 'SELLER' | 'RIDER' } | null>(null);
  partnerSaving = signal(false);
  partnerSubmitted = signal(false);
  partnerForm = this.emptyPartnerForm();
  readonly banks = ['Bank of Bhutan', 'Bhutan National Bank', 'Druk PNB Bank', 'T Bank', 'Bhutan Development Bank', 'Digital Kidu Bank'];
  readonly vehicles = ['Motorbike', 'Scooter', 'Car', 'Taxi', 'Pickup truck', 'Van', 'Bicycle', 'On foot'];
  readonly today = new Date().toISOString().slice(0, 10);

  visible = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const role = this.roleFilter();
    const status = this.statusFilter();
    return this.users().filter(u =>
      (!role || u.roleName === role) &&
      (status === 'all' || (status === 'active') === u.active) &&
      (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term) || (u.phone ?? '').includes(term))
    );
  });

  counts = computed(() => {
    const result: Record<string, number> = {};
    for (const u of this.users()) result[u.roleName ?? ''] = (result[u.roleName ?? ''] ?? 0) + 1;
    return result;
  });

  // ---------- People: add ----------
  showAdd = signal(false);
  adding = signal(false);
  addSubmitted = signal(false);
  addError = signal('');
  newUser = { name: '', email: '', phone: '', password: '', roleId: 0 };
  created = signal<{ name: string; email: string; password: string; role: string } | null>(null);
  tempPassword = signal<{ name: string; email: string; password: string } | null>(null);

  // ---------- correcting a person's name, email or phone ----------
  editingId = signal<number | null>(null);
  details = { name: '', email: '', phone: '' };
  detailsTried = signal(false);

  editDetails(user: AdminUser) {
    this.details = { name: user.name ?? '', email: user.email ?? '', phone: user.phone ?? '' };
    this.detailsTried.set(false);
    this.editingId.set(user.id);
    setTimeout(() => document.getElementById('d-name-' + user.id)?.focus());
  }

  detailsError(field: 'name' | 'email' | 'phone') {
    const v = this.details[field].trim();
    if (field === 'name') return v ? '' : 'Enter the full name.';
    if (field === 'email') return /^\S+@\S+\.\S+$/.test(v) ? '' : 'Enter a valid email address.';
    return /^[0-9]{8}$/.test(v) ? '' : 'Enter an 8-digit phone number.';
  }

  async saveDetails(user: AdminUser) {
    this.detailsTried.set(true);
    if (this.detailsError('name') || this.detailsError('email') || this.detailsError('phone')) return;
    const emailChanges = this.details.email.trim().toLowerCase() !== (user.email ?? '').toLowerCase();
    if (emailChanges && !await this.confirm.ask({
      title: 'Change the sign-in email?',
      message: `${user.name} will sign in with ${this.details.email.trim()} from now on (same password). They are signed out now, and both the old and the new address get an email about it. Their orders, reviews and notifications move with them.`,
      confirmLabel: 'Change email'
    })) return;
    this.busyId.set(user.id);
    this.userService.changeDetails(user.id, {
      name: this.details.name.trim(), email: this.details.email.trim(), phone: this.details.phone.trim()
    }).subscribe({
      next: updated => {
        this.busyId.set(null);
        this.editingId.set(null);
        this.replaceUser(updated);
        this.toasts.success(`${updated.name}'s details are saved.`);
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  // ---------- Roles ----------
  selectedRoleId = signal<number | null>(null);
  draft = signal<RoleDraft | null>(null);
  savingRole = signal(false);

  groups = computed(() => {
    const map = new Map<string, PermissionInfo[]>();
    for (const p of this.catalog()) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  });

  selectedRole = computed(() => this.roles().find(r => r.id === this.selectedRoleId()) ?? null);
  // the role being edited is the editor's own role: the server refuses, so the screen locks it
  isMyRole = computed(() => {
    const role = this.selectedRole();
    return !!role && role.name.toUpperCase() === (this.auth.role() ?? '').toUpperCase();
  });
  draftLocked = computed(() => !!this.selectedRole()?.locked || this.isMyRole());
  dirty = computed(() => {
    const d = this.draft();
    if (!d) return false;
    if (d.id === null) return true;
    const role = this.selectedRole();
    if (!role) return false;
    const same = role.permissions.length === d.permissions.size && role.permissions.every(p => d.permissions.has(p));
    return !same || (role.description ?? '') !== d.description || role.name !== d.name;
  });

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading.set(true);
    this.loadError.set('');
    this.serverOutdated.set(false);
    this.userService.permissions().subscribe({
      next: list => this.catalog.set(list),
      error: (err: HttpErrorResponse) => { if (err.status === 404) this.serverOutdated.set(true); }
    });
    this.userService.roles().subscribe({
      next: roles => {
        this.roles.set(roles);
        if (!this.newUser.roleId) this.newUser.roleId = roles.find(r => r.name === 'USER')?.id ?? 0;
        if (this.selectedRoleId() === null && roles.length) this.selectRole(roles.find(r => r.name === 'MANAGER') ?? roles[0]);
      },
      error: () => {}
    });
    this.userService.getAll().subscribe({
      next: users => {
        this.users.set(users.map(normalizeUser));
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(err.status === 403 ? 'Your account is not allowed to manage people.' : errorText(err));
      }
    });
  }

  loadAudit() {
    this.userService.audit().subscribe({ next: rows => this.audit.set(rows), error: (err: HttpErrorResponse) => this.toasts.error(errorText(err)) });
  }

  openTab(tab: Tab) {
    this.tab.set(tab);
    if (tab === 'activity') this.loadAudit();
  }

  isMe(user: AdminUser) {
    return user.email.toLowerCase() === this.myEmail;
  }

  isPartnerRole(name: string | null) {
    return PARTNER_ROLES.includes((name ?? '').toUpperCase());
  }

  roleLabel(name: string | null): string {
    if (!name) return '-';
    const n = name.toUpperCase();
    const known: Record<string, string> = { ADMIN: 'Admin', MANAGER: 'Manager', CONTROLLER: 'Controller', SELLER: 'Seller', RIDER: 'Delivery driver', USER: 'Customer' };
    return known[n] ?? n.charAt(0) + n.slice(1).toLowerCase().replace(/_/g, ' ');
  }

  permissionLabel(key: string) {
    return this.catalog().find(p => p.key === key)?.label ?? key;
  }

  // ---------- People: actions ----------
  private replaceUser(updated: AdminUser) {
    this.users.update(list => list.map(u => (u.id === updated.id ? updated : u)));
  }

  async changeRole(user: AdminUser, roleId: number, select: HTMLSelectElement) {
    const role = this.roles().find(r => r.id === Number(roleId));
    if (!role || role.id === user.roleId) return;

    // Seller / Delivery driver
    const partnerType = role.name.toUpperCase() === 'SELLER' ? 'SELLER' : role.name.toUpperCase() === 'RIDER' ? 'RIDER' : null;
    if (partnerType) {
      select.value = String(user.roleId); // stays as it is until the details are saved or the application approved
      const label = partnerType === 'SELLER' ? 'seller' : 'delivery driver';
      if (user.partner && user.partner !== partnerType && user.partnerStatus !== 'REJECTED') {
        this.toasts.error(user.name + ' is already a ' + (user.partner === 'SELLER' ? 'seller' : 'delivery driver') + '. One account cannot be both.');
        return;
      }
      if (user.partner === partnerType) {
        const ok = await this.confirm.ask({
          title: 'Make ' + user.name + ' a ' + label + '?',
          message: user.partnerStatus === 'APPROVED'
            ? 'Their ' + label + ' account is already approved. This gives them the ' + label + ' role again.'
            : 'They already applied (' + (user.partnerStatus ?? '').toLowerCase() + '). This approves their application with the details and documents they sent.',
          confirmLabel: 'Approve and change role'
        });
        if (!ok) return;
        this.busyId.set(user.id);
        this.userService.setUserRole(user.id, role.id).subscribe({
          next: updated => {
            this.busyId.set(null);
            this.replaceUser(normalizeUser(updated));
            this.toasts.success(user.name + ' is now a ' + label + '.');
            this.refreshRoles();
          },
          error: (err: HttpErrorResponse) => {
            this.busyId.set(null);
            this.toasts.error(errorText(err));
          }
        });
        return;
      }
      // no application yet: ask for the details
      this.partnerForm = this.emptyPartnerForm(user);
      this.partnerSubmitted.set(false);
      this.partnerFor.set({ user, type: partnerType });
      return;
    }
    const toAdmin = role.name === 'ADMIN';
    const fromAdmin = user.roleName === 'ADMIN';
    const lost = user.partner && this.isPartnerRole(user.roleName)
      ? ` Their ${user.partner === 'SELLER' ? 'shop' : 'driver account'} will be paused.` : '';
    const ok = await this.confirm.ask({
      title: 'Change role',
      message: `Change ${user.name} from ${this.roleLabel(user.roleName)} to ${this.roleLabel(role.name)}? `
        + `They will be able to: ${role.permissions.map(p => this.permissionLabel(p)).join(', ') || 'shop online only'}.${lost}`,
      confirmLabel: 'Change role',
      danger: toAdmin || fromAdmin
    });
    if (!ok) {
      select.value = String(user.roleId);
      return;
    }
    this.busyId.set(user.id);
    this.userService.setUserRole(user.id, role.id).subscribe({
      next: updated => {
        this.busyId.set(null);
        this.replaceUser(updated);
        this.toasts.success(`${user.name} is now ${this.roleLabel(role.name)}. It works on their next click.`);
        this.refreshRoles();
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        select.value = String(user.roleId);
        this.toasts.error(errorText(err));
      }
    });
  }

  async toggleActive(user: AdminUser) {
    const off = user.active;
    const ok = await this.confirm.ask({
      title: off ? 'Switch off this account' : 'Switch this account on',
      message: off
        ? `${user.name} will be signed out at once and cannot sign in. Their orders and history are kept.`
        : `${user.name} will be able to sign in again.`,
      confirmLabel: off ? 'Switch off' : 'Switch on',
      danger: off
    });
    if (!ok) return;
    this.busyId.set(user.id);
    this.userService.setActive(user.id, !off).subscribe({
      next: updated => {
        this.busyId.set(null);
        this.replaceUser(updated);
        this.toasts.success(off ? `${user.name} is switched off.` : `${user.name} can sign in again.`);
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  async resetPassword(user: AdminUser) {
    const ok = await this.confirm.ask({
      title: 'Reset password',
      message: `Make a new temporary password for ${user.name}? Their old password stops working. Give them the new one in person or by phone, and ask them to change it in My profile.`,
      confirmLabel: 'Make new password'
    });
    if (!ok) return;
    this.busyId.set(user.id);
    this.userService.resetPassword(user.id).subscribe({
      next: res => {
        this.busyId.set(null);
        this.tempPassword.set({ name: user.name, email: user.email, password: res.password });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => this.toasts.success('Copied'),
      () => this.toasts.error('Could not copy. Please select and copy it by hand.')
    );
  }

  private emptyPartnerForm(user?: AdminUser) {
    return {
      shopName: '', phone: user?.phone ?? '', pickupAddress: '', town: '', description: '', cidNumber: '',
      tradeLicenseNumber: '', tpnNumber: '', bankName: 'Bank of Bhutan', bankAccountName: user?.name ?? '', bankAccountNumber: '',
      vehicleType: 'Motorbike', vehicleNumber: '', licenseNumber: '', licenseExpiry: '',
      emergencyContactName: '', emergencyContactPhone: ''
    };
  }

  partnerNeedsLicence() {
    return !['Bicycle', 'On foot'].includes(this.partnerForm.vehicleType);
  }

  partnerErrors(): string[] {
    const f = this.partnerForm;
    const type = this.partnerFor()?.type;
    const e: string[] = [];
    if (type === 'SELLER') {
      if (!f.shopName.trim()) e.push('Shop name');
      if (!f.pickupAddress.trim()) e.push('Pickup address');
    } else {
      if (this.partnerNeedsLicence()) {
        if (!f.licenseNumber.trim()) e.push('Driving licence number');
        if (!f.licenseExpiry || f.licenseExpiry <= this.today) e.push('Licence expiry (in the future)');
      }
      if (!f.emergencyContactName.trim()) e.push('Emergency contact name');
      if (!/^[0-9]{8}$/.test(f.emergencyContactPhone.trim())) e.push('Emergency contact phone (8 digits)');
    }
    if (!/^[0-9]{8}$/.test(f.phone.trim())) e.push('Phone (8 digits)');
    if (!/^[0-9]{11}$/.test(f.cidNumber.trim())) e.push('CID number (11 digits)');
    if (!f.town.trim()) e.push('Town');
    if (!f.bankAccountName.trim()) e.push('Account holder name');
    if (!/^[0-9]{6,20}$/.test(f.bankAccountNumber.replace(/\s/g, ''))) e.push('Account number');
    return e;
  }

  savePartner() {
    const target = this.partnerFor();
    if (!target || this.partnerSaving()) return;
    this.partnerSubmitted.set(true);
    if (this.partnerErrors().length > 0) return;
    const f = this.partnerForm;
    this.partnerSaving.set(true);
    const request = target.type === 'SELLER'
      ? this.userService.makeSeller(target.user.id, {
          shopName: f.shopName, phone: f.phone, pickupAddress: f.pickupAddress, town: f.town, description: f.description,
          bankName: f.bankName, bankAccountName: f.bankAccountName, bankAccountNumber: f.bankAccountNumber,
          cidNumber: f.cidNumber, tradeLicenseNumber: f.tradeLicenseNumber, tpnNumber: f.tpnNumber
        })
      : this.userService.makeDriver(target.user.id, {
          phone: f.phone, vehicleType: f.vehicleType, vehicleNumber: f.vehicleNumber, licenseNumber: f.licenseNumber,
          town: f.town, bankName: f.bankName, bankAccountName: f.bankAccountName, bankAccountNumber: f.bankAccountNumber,
          cidNumber: f.cidNumber, licenseExpiry: f.licenseExpiry || null,
          emergencyContactName: f.emergencyContactName, emergencyContactPhone: f.emergencyContactPhone
        });
    request.subscribe({
      next: updated => {
        this.partnerSaving.set(false);
        this.partnerFor.set(null);
        this.replaceUser(normalizeUser(updated));
        this.refreshRoles();
        this.toasts.success(target.user.name + ' is now a ' + (target.type === 'SELLER' ? 'seller' : 'delivery driver')
          + '. They accept the agreement when they first open their dashboard.');
      },
      error: (err: HttpErrorResponse) => {
        this.partnerSaving.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  // ---------- People: add ----------
  generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const values = crypto.getRandomValues(new Uint32Array(10));
    this.newUser.password = Array.from(values, v => chars[v % chars.length]).join('');
  }

  addErrors() {
    const e: Record<string, string> = {};
    const u = this.newUser;
    if (!u.name.trim()) e['name'] = 'Enter the full name.';
    if (!/^\S+@\S+\.\S+$/.test(u.email.trim())) e['email'] = 'Enter a valid email address.';
    if (!/^[0-9]{8}$/.test(u.phone.trim())) e['phone'] = 'Enter an 8-digit phone number.';
    if (u.password.length < 6) e['password'] = 'At least 6 characters (or press Make one).';
    if (!u.roleId) e['role'] = 'Choose a role.';
    return e;
  }

  async createUser() {
    if (this.adding()) return;
    this.addError.set('');
    this.addSubmitted.set(true);
    if (Object.keys(this.addErrors()).length > 0) {
      focusFirstError(this.host.nativeElement);
      return;
    }
    const role = this.roles().find(r => r.id === Number(this.newUser.roleId));
    if (role?.name === 'ADMIN') {
      const ok = await this.confirm.ask({
        title: 'Create an administrator',
        message: `${this.newUser.name} will be able to see and change everything, including other people's access. Create the account?`,
        confirmLabel: 'Create administrator',
        danger: true
      });
      if (!ok) return;
    }
    const u = this.newUser;
    this.adding.set(true);
    this.userService.create({ name: u.name.trim(), email: u.email.trim(), phone: u.phone.trim(), password: u.password, roleId: Number(u.roleId) })
      .subscribe({
        next: user => {
          this.adding.set(false);
          this.users.update(list => [user, ...list]);
          this.created.set({ name: user.name, email: user.email, password: u.password, role: this.roleLabel(user.roleName) });
          this.newUser = { name: '', email: '', phone: '', password: '', roleId: this.newUserRoles().find(r => r.name === 'USER')?.id ?? 0 };
          this.addSubmitted.set(false);
          this.showAdd.set(false);
          this.refreshRoles();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: (err: HttpErrorResponse) => {
          this.adding.set(false);
          this.addError.set(errorText(err));
        }
      });
  }

  // ---------- Roles ----------
  private refreshRoles() {
    this.userService.roles().subscribe({ next: roles => this.roles.set(roles), error: () => {} });
  }

  async selectRole(role: RoleInfo) {
    if (this.dirty() && this.draft()?.id !== role.id) {
      const ok = await this.confirm.ask({ title: 'Unsaved changes', message: 'Leave this role without saving?', confirmLabel: 'Leave', danger: true });
      if (!ok) return;
    }
    this.selectedRoleId.set(role.id);
    this.draft.set({ id: role.id, name: role.name, description: role.description ?? '', permissions: new Set(role.permissions) });
  }

  newRole() {
    this.selectedRoleId.set(null);
    this.draft.set({ id: null, name: '', description: '', permissions: new Set(['pos.use']) });
  }

  toggle(key: string) {
    const d = this.draft();
    if (!d || this.draftLocked()) return;
    const next = new Set(d.permissions);
    next.has(key) ? next.delete(key) : next.add(key);
    this.draft.set({ ...d, permissions: next });
  }

  toggleGroup(items: PermissionInfo[], on: boolean) {
    const d = this.draft();
    if (!d || this.draftLocked()) return;
    const next = new Set(d.permissions);
    items.forEach(p => (on ? next.add(p.key) : next.delete(p.key)));
    this.draft.set({ ...d, permissions: next });
  }

  groupState(items: PermissionInfo[]): 'all' | 'some' | 'none' {
    const d = this.draft();
    const n = items.filter(p => d?.permissions.has(p.key)).length;
    return n === 0 ? 'none' : n === items.length ? 'all' : 'some';
  }

  setDraft(field: 'name' | 'description', value: string) {
    const d = this.draft();
    if (d) this.draft.set({ ...d, [field]: value });
  }

  async saveRole() {
    const d = this.draft();
    if (!d || this.savingRole()) return;
    if (d.id === null && d.name.trim().length < 3) {
      this.toasts.error('Give the role a name (at least 3 letters), for example Cashier.');
      return;
    }
    const sensitive = this.catalog().filter(p => p.sensitive && d.permissions.has(p.key) && !this.selectedRole()?.permissions.includes(p.key));
    if (sensitive.length) {
      const ok = await this.confirm.ask({
        title: 'Give sensitive access?',
        message: `This role will be able to: ${sensitive.map(p => p.label).join(', ')}. Only give this to people you trust with money or other people's accounts.`,
        confirmLabel: 'Yes, save',
        danger: true
      });
      if (!ok) return;
    }
    const body = { name: d.name.trim(), description: d.description.trim(), permissions: [...d.permissions] };
    this.savingRole.set(true);
    const request = d.id === null ? this.userService.createRole(body) : this.userService.updateRole(d.id, body);
    request.subscribe({
      next: saved => {
        this.savingRole.set(false);
        this.roles.update(list => {
          const rest = list.filter(r => r.id !== saved.id);
          return d.id === null ? [...rest, saved] : list.map(r => (r.id === saved.id ? saved : r));
        });
        this.selectedRoleId.set(saved.id);
        this.draft.set({ id: saved.id, name: saved.name, description: saved.description ?? '', permissions: new Set(saved.permissions) });
        this.toasts.success(d.id === null ? `Role ${saved.name} created.` : `Saved. ${saved.userCount} ${saved.userCount === 1 ? 'person has' : 'people have'} the new access from their next click.`);
      },
      error: (err: HttpErrorResponse) => {
        this.savingRole.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  cancelRole() {
    const role = this.selectedRole() ?? this.roles()[0];
    if (role) {
      this.selectedRoleId.set(role.id);
      this.draft.set({ id: role.id, name: role.name, description: role.description ?? '', permissions: new Set(role.permissions) });
    }
  }

  async deleteRole() {
    const role = this.selectedRole();
    if (!role) return;
    const ok = await this.confirm.ask({ title: 'Delete role', message: `Delete the role ${role.name}?`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    this.userService.deleteRole(role.id).subscribe({
      next: () => {
        this.roles.update(list => list.filter(r => r.id !== role.id));
        this.toasts.success(`Role ${role.name} deleted.`);
        const first = this.roles()[0];
        this.draft.set(null);
        this.selectedRoleId.set(null);
        if (first) this.selectRole(first);
      },
      error: (err: HttpErrorResponse) => this.toasts.error(errorText(err))
    });
  }

  peopleWith(role: RoleInfo) {
    this.roleFilter.set(role.name);
    this.statusFilter.set('all');
    this.tab.set('people');
  }

  // ---------- Activity ----------
  actionLabel(action: string): string {
    const labels: Record<string, string> = {
      USER_CREATED: 'Added a person', USER_ROLE_CHANGED: 'Changed a role', USER_DEACTIVATED: 'Switched an account off',
      USER_REACTIVATED: 'Switched an account on', USER_PASSWORD_RESET: 'Reset a password', ROLE_CREATED: 'Created a role',
      ROLE_PERMISSIONS_CHANGED: 'Changed what a role can do', ROLE_DELETED: 'Deleted a role', PAYOUT: 'Recorded a payout',
      MARKETPLACE_SETTINGS: 'Changed marketplace settings', SELLER_COMMISSION: 'Changed a seller\'s commission',
      SHIFT_OPENED: 'Opened a cash drawer', SHIFT_CLOSED: 'Closed a cash drawer',
      PASSWORD_RESET_CODE_OK: 'Confirmed a forgot-password code', PASSWORD_RESET_SELF: 'Chose a new password (forgot password)',
      PASSWORD_RESET_BY_EMAIL: 'Chose a new password (forgot password)',
      SITE_ABOUT_CHANGED: 'Changed the About page', TEAM_MEMBER_ADDED: 'Added a team member',
      TEAM_MEMBER_CHANGED: 'Changed a team member', TEAM_MEMBER_REMOVED: 'Removed a team member'
    };
    if (labels[action]) return labels[action];
    if (/^(SELLER|RIDER)_(APPROVED|REJECTED|SUSPENDED)$/.test(action)) {
      const [who, what] = action.split('_');
      return `${what.charAt(0) + what.slice(1).toLowerCase()} a ${who.toLowerCase()}`;
    }
    return action;
  }
}
