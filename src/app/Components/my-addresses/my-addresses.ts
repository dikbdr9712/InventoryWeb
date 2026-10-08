import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AddressForm, AddressService, SavedAddress } from '../../services/addresses';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { DeliveryPoint } from '../../models/models';
import { DeliveryLocation } from '../delivery-location/delivery-location';
import { errorText } from '../../utils/http-error';

// "My addresses" on the profile page: the saved delivery addresses, add, edit, make default, remove.
@Component({
  selector: 'app-my-addresses',
  imports: [FormsModule, DeliveryLocation],
  templateUrl: './my-addresses.html',
  styleUrl: './my-addresses.css'
})
export class MyAddresses {
  private api = inject(AddressService);
  private auth = inject(AuthService);
  private toasts = inject(ToastService);
  private confirm = inject(ConfirmService);

  addresses = signal<SavedAddress[]>([]);
  loaded = signal(false);
  editing = signal<number | 'new' | null>(null);
  saving = signal(false);
  form: AddressForm = this.empty();
  point = signal<DeliveryPoint | null>(null);
  readonly labels = ['Home', 'Office', 'Other'];

  constructor() {
    this.api.list().subscribe({
      next: list => { this.addresses.set(list); this.loaded.set(true); },
      error: () => this.loaded.set(true)
    });
  }

  add() {
    this.form = this.empty();
    this.point.set(null);
    this.editing.set('new');
  }

  edit(a: SavedAddress) {
    this.form = { label: a.label, phone: a.phone, address: a.address, makeDefault: a.isDefault };
    this.point.set(AddressService.pointOf(a));
    this.editing.set(a.id);
  }

  cancel() {
    this.editing.set(null);
  }

  save() {
    const id = this.editing();
    if (id === null) return;
    const body: AddressForm = { ...this.form, ...AddressService.fromPoint(this.point()) };
    this.saving.set(true);
    const call = id === 'new' ? this.api.add(body) : this.api.update(id, body);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(null);
        this.toasts.success('Address saved.');
        this.api.list().subscribe({ next: list => this.addresses.set(list) });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  makeDefault(a: SavedAddress) {
    this.api.makeDefault(a.id).subscribe({
      next: list => { this.addresses.set(list); this.toasts.success(`${a.label} is your default address.`); },
      error: (err: HttpErrorResponse) => this.toasts.error(errorText(err))
    });
  }

  async remove(a: SavedAddress) {
    if (!await this.confirm.ask({ title: `Remove "${a.label}"?`, message: a.address, confirmLabel: 'Remove', danger: true })) return;
    this.api.remove(a.id).subscribe({
      next: list => { this.addresses.set(list); this.toasts.success('Address removed.'); },
      error: (err: HttpErrorResponse) => this.toasts.error(errorText(err))
    });
  }

  private empty(): AddressForm {
    return { label: 'Home', phone: this.auth.phone() ?? '', address: '', makeDefault: false };
  }
}
