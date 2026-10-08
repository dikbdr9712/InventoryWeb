import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { errorText } from '../../utils/http-error';
import { AuthService } from '../../services/auth';
import { CartService } from '../../services/cart';
import { OrderService } from '../../services/order';
import { ToastService } from '../../services/toast';
import { Order } from '../../models/models';
import { PERMISSION_LABELS, permissionsFor } from '../../utils/permissions';
import { orderLabel, orderPill } from '../../utils/order-status';
import { MyAddresses } from '../my-addresses/my-addresses';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  CONTROLLER: 'Controller',
  USER: 'Customer',
  SELLER: 'Seller',
  RIDER: 'Delivery driver'
};

@Component({
  selector: 'app-profile',
  imports: [RouterLink, FormsModule, MyAddresses],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {
  private auth = inject(AuthService);
  private cart = inject(CartService);
  private router = inject(Router);
  private orderService = inject(OrderService);
  private toasts = inject(ToastService);

  orderLabel = orderLabel;
  orderPill = orderPill;

  // read each time, so the page shows a change at once
  get name() { return this.auth.name() || 'Your account'; }
  get email() { return this.auth.email() || ''; }
  get phone() { return this.auth.phone() || ''; }
  get photo() { return this.auth.photo(); }

  roleName = (this.auth.role() ?? 'USER').toUpperCase();
  roleLabel = ROLE_LABELS[this.roleName] ?? this.roleName;

  // What this account may do, in plain words (customers have no staff tools)
  abilities = ((this.auth.permissions() ?? permissionsFor(this.roleName)) as (keyof typeof PERMISSION_LABELS)[])
    .map(p => PERMISSION_LABELS[p])
    .filter(Boolean);

  orders = signal<Order[]>([]);
  ordersLoaded = signal(false);
  latest = computed(() => [...this.orders()].sort((a, b) => b.orderId - a.orderId)[0] ?? null);

  get initials() {
    const parts = this.name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  // ---------- Your details: name, phone, email ----------
  editing = signal(false);
  saving = signal(false);
  detailsError = signal('');
  details = { name: '', email: '', phone: '', currentPassword: '' };

  emailChanging(): boolean {
    return this.details.email.trim().toLowerCase() !== this.email.toLowerCase();
  }

  editDetails() {
    this.details = { name: this.auth.name() ?? '', email: this.email, phone: this.phone, currentPassword: '' };
    this.detailsError.set('');
    this.editing.set(true);
  }

  saveDetails() {
    const d = this.details;
    if (!d.name.trim()) { this.detailsError.set('Enter your full name.'); return; }
    if (!/^[0-9]{8}$/.test(d.phone.trim())) { this.detailsError.set('Enter an 8-digit phone number.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) { this.detailsError.set('Enter a valid email address.'); return; }
    if (this.emailChanging() && !d.currentPassword) { this.detailsError.set('To change your email, type your current password.'); return; }
    this.saving.set(true);
    this.detailsError.set('');
    this.auth.updateProfile({ name: d.name.trim(), email: d.email.trim(), phone: d.phone.trim(),
      currentPassword: this.emailChanging() ? d.currentPassword : undefined }).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
        this.toasts.success('Your details are saved.');
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.detailsError.set(errorText(err));
      }
    });
  }

  // ---------- Profile photo: made square and small on the phone, then sent ----------
  photoBusy = signal(false);

  async onPhoto(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.toasts.error('Choose a photo (JPG or PNG).'); return; }
    this.photoBusy.set(true);
    try {
      const blob = await squarePhoto(file, 320);
      this.auth.uploadPhoto(blob).subscribe({
        next: () => { this.photoBusy.set(false); this.toasts.success('Your photo is saved.'); },
        error: (err: HttpErrorResponse) => { this.photoBusy.set(false); this.toasts.error(errorText(err)); }
      });
    } catch {
      this.photoBusy.set(false);
      this.toasts.error('This photo could not be read. Choose a JPG or PNG photo.');
    }
  }

  removePhoto() {
    this.photoBusy.set(true);
    this.auth.removePhoto().subscribe({
      next: () => { this.photoBusy.set(false); this.toasts.success('Your photo is removed.'); },
      error: (err: HttpErrorResponse) => { this.photoBusy.set(false); this.toasts.error(errorText(err)); }
    });
  }

  // Change password
  pw = { current: '', next: '', confirm: '' };
  pwSubmitted = signal(false);
  pwSaving = signal(false);
  pwError = signal('');

  pwErrors() {
    const e: { current?: string; next?: string; confirm?: string } = {};
    if (!this.pw.current) e.current = 'Enter your current password.';
    if (this.pw.next.length < 6) e.next = 'Use at least 6 characters.';
    else if (this.pw.next === this.pw.current) e.next = 'Choose a password different from the current one.';
    if (this.pw.confirm !== this.pw.next) e.confirm = 'The passwords do not match.';
    return e;
  }

  changePassword() {
    if (this.pwSaving()) return;
    this.pwError.set('');
    this.pwSubmitted.set(true);
    if (Object.keys(this.pwErrors()).length > 0) return;

    this.pwSaving.set(true);
    this.auth.changePassword(this.pw.current, this.pw.next).subscribe({
      next: () => {
        this.pwSaving.set(false);
        this.pwSubmitted.set(false);
        this.pw = { current: '', next: '', confirm: '' };
        this.toasts.success('Your password has been changed.');
      },
      error: (err: HttpErrorResponse) => {
        this.pwSaving.set(false);
        this.pwError.set(errorText(err));
      }
    });
  }

  ngOnInit() {
    if (!this.email) return;
    this.orderService.getByCustomer(this.email).subscribe({
      next: orders => {
        this.orders.set(orders);
        this.ordersLoaded.set(true);
      },
      error: () => this.ordersLoaded.set(true) // the page still works without the order summary
    });
  }

  signOut() {
    this.auth.logout();
    this.cart.clear(); // the next person at a shared computer starts with an empty cart
    this.toasts.info('You have been signed out.');
    this.router.navigate(['/']);
  }
}

// The middle square of a photo, made size x size pixels, as a JPG (a phone photo of several MB becomes about 30 KB)
async function squarePhoto(file: File, size: number): Promise<Blob> {
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no canvas');
  g.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
  image.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('no photo'))), 'image/jpeg', 0.88));
}
