import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MarketplaceService } from '../../services/marketplace';
import { AuthService } from '../../services/auth';
import { ItemService } from '../../services/item';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { DeliverySize, LedgerRow, OrderPackage, PartnerHome, SellerItem } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { focusFirstError } from '../../utils/focus-error';
import { packageLabel, packagePill } from '../../utils/package-status';
import { TermsGate } from '../terms-gate/terms-gate';
import { MapPoint } from '../map-point/map-point';
import { DELIVERY_SIZES, LatLng, point } from '../../utils/location';

type Tab = 'overview' | 'packages' | 'products' | 'money';
type PackageFilter = 'todo' | 'moving' | 'done' | 'all';

interface ProductForm {
  itemName: string;
  category: string;
  description: string;
  uom: string;
  sellingPrice: number | null;
  mrp: number | null;
  quantity: number | null;
  isActive: boolean;
  deliverySize: DeliverySize;
}

// A seller's shop: what to pack, their products, and the money they have earned.
@Component({
  selector: 'app-seller-hub',
  imports: [FormsModule, RouterLink, DecimalPipe, DatePipe, TermsGate, MapPoint],
  templateUrl: './seller-hub.html',
  styleUrl: './seller-hub.css'
})
export class SellerHub implements OnInit {
  private marketplace = inject(MarketplaceService);
  private auth = inject(AuthService);

  // What this seller account may do (ticked in People & access). The server checks the same rights.
  may = {
    products: this.auth.can('seller.products'),
    orders: this.auth.can('seller.orders'),
    earnings: this.auth.can('seller.earnings')
  };
  private itemService = inject(ItemService);
  private toasts = inject(ToastService);
  private dialog = inject(ConfirmService);
  private host = inject(ElementRef);

  packageLabel = packageLabel;
  packagePill = packagePill;

  tab = signal<Tab>('overview');
  home = signal<PartnerHome | null>(null);
  loadError = signal('');
  termsRequired = signal(false); // a new Seller Agreement must be accepted first
  packages = signal<OrderPackage[]>([]);
  products = signal<SellerItem[]>([]);
  ledger = signal<LedgerRow[]>([]);
  busy = signal<number | null>(null);
  filter = signal<PackageFilter>('todo');

  toPack = computed(() => this.packages().filter(p => p.status === 'TO_PACK'));
  shownPackages = computed(() => {
    const list = this.packages();
    switch (this.filter()) {
      case 'todo': return list.filter(p => p.status === 'TO_PACK');
      case 'moving': return list.filter(p => ['READY_FOR_PICKUP', 'ASSIGNED', 'PICKED_UP'].includes(p.status));
      case 'done': return list.filter(p => p.status === 'DELIVERED' || p.status === 'CANCELLED');
      default: return list;
    }
  });
  lowStock = computed(() => this.products().filter(p => p.isActive !== false && (p.currentQuantity ?? 0) <= 3));

  // ---------- Product form ----------
  editingId = signal<number | null>(null);
  showForm = signal(false);
  saving = signal(false);
  submitted = signal(false);
  formError = signal('');
  photo: File | null = null;
  photoPreview = signal<string | null>(null);
  form: ProductForm = this.emptyForm();
  readonly units = ['pcs', 'pack', 'bottle', 'jar', 'kg', 'g', 'litre', 'box', 'set'];
  readonly sizes = DELIVERY_SIZES;

  // ---------- Pickup point: where riders collect packages (delivery distance is measured from here) ----------
  pickupPoint = computed<LatLng | null>(() => point(this.home()?.profile.pickupLatitude, this.home()?.profile.pickupLongitude));
  savingPoint = signal(false);

  savePickup(p: LatLng | null) {
    if (!p || this.savingPoint()) return;
    this.savingPoint.set(true);
    this.marketplace.setSellerLocation(p.latitude, p.longitude).subscribe({
      next: profile => {
        this.savingPoint.set(false);
        const h = this.home();
        if (h) this.home.set({ ...h, profile });
        this.toasts.success('Pickup point saved. Delivery prices now use the real distance.');
      },
      error: (err: HttpErrorResponse) => {
        this.savingPoint.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  ngOnInit() {
    this.marketplace.sellerHome().subscribe({
      next: home => this.home.set(home),
      error: (err: HttpErrorResponse) => {
        if (err.status === 428) this.termsRequired.set(true);
        else this.loadError.set(errorText(err));
      }
    });
    if (this.may.orders) this.loadPackages();
    if (this.may.products) this.loadProducts();
    if (this.may.earnings) this.marketplace.sellerLedger().subscribe({ next: rows => this.ledger.set(rows), error: () => {} });
  }

  private loadPackages() {
    this.marketplace.sellerPackages().subscribe({ next: list => this.packages.set(list), error: () => {} });
  }

  private loadProducts() {
    this.marketplace.sellerItems().subscribe({ next: list => this.products.set(list), error: () => {} });
  }

  private refreshHome() {
    this.marketplace.sellerHome().subscribe({ next: home => this.home.set(home), error: () => {} });
  }

  image(path?: string) {
    return this.itemService.imageUrl(path);
  }

  afterTerms() {
    this.termsRequired.set(false);
    this.loadError.set('');
    this.ngOnInit();
  }

  // ---------- Packages ----------
  async markPacked(p: OrderPackage) {
    const ok = await this.dialog.ask({
      title: `Package for order #${p.orderId}`,
      message: `Is everything (${p.itemCount} item${p.itemCount === 1 ? '' : 's'}) packed and ready for a rider to collect?`,
      confirmLabel: 'Yes, ready for pickup'
    });
    if (!ok) return;
    this.busy.set(p.id);
    this.marketplace.sellerPacked(p.id).subscribe({
      next: updated => {
        this.busy.set(null);
        this.packages.update(list => list.map(x => (x.id === updated.id ? updated : x)));
        this.toasts.success('Marked as packed. Riders can now see the job.');
        this.refreshHome();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  // ---------- Products ----------
  private emptyForm(): ProductForm {
    return { itemName: '', category: '', description: '', uom: 'pcs', sellingPrice: null, mrp: null, quantity: 0, isActive: true, deliverySize: 'SMALL' };
  }

  newProduct() {
    this.form = this.emptyForm();
    this.editingId.set(null);
    this.openForm(null);
  }

  editProduct(item: SellerItem) {
    this.form = {
      itemName: item.itemName, category: item.category ?? '', description: item.description ?? '', uom: item.uom ?? 'pcs',
      sellingPrice: item.sellingPrice ?? null, mrp: item.mrp ?? null, quantity: item.currentQuantity ?? 0, isActive: item.isActive !== false,
      deliverySize: item.deliverySize ?? 'SMALL'
    };
    this.editingId.set(item.itemId);
    this.openForm(item.imagePath ? this.image(item.imagePath) : null);
  }

  private openForm(preview: string | null) {
    this.photo = null;
    this.photoPreview.set(preview);
    this.submitted.set(false);
    this.formError.set('');
    this.showForm.set(true);
    setTimeout(() => this.host.nativeElement.querySelector('#product-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  onPhoto(input: HTMLInputElement) {
    const file = input.files?.[0] ?? null;
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.toasts.error('Choose a JPG, PNG or WEBP photo.');
      input.value = '';
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      this.toasts.error('That photo is bigger than 5 MB.');
      input.value = '';
      return;
    }
    this.photo = file;
    this.photoPreview.set(file ? URL.createObjectURL(file) : null);
  }

  formErrors() {
    const e: Record<string, string> = {};
    const f = this.form;
    if (!f.itemName.trim()) e['itemName'] = 'Enter the product name.';
    if (!(Number(f.sellingPrice) > 0)) e['sellingPrice'] = 'Enter a price above zero.';
    if (f.mrp != null && String(f.mrp) !== '' && Number(f.mrp) > 0 && Number(f.mrp) < Number(f.sellingPrice)) {
      e['mrp'] = 'MRP cannot be lower than your price.';
    }
    if (!(Number(f.quantity) >= 0) || !Number.isInteger(Number(f.quantity))) e['quantity'] = 'Enter a whole number, 0 or more.';
    return e;
  }

  // What the seller keeps from one sale of this product, at their commission rate
  keepPerUnit(): number | null {
    const price = Number(this.form.sellingPrice);
    const rate = Number(this.home()?.profile.effectiveCommissionPercent ?? 0);
    if (!(price > 0)) return null;
    return Math.round((price - (price * rate) / 100) * 100) / 100;
  }

  saveProduct() {
    if (this.saving()) return;
    this.formError.set('');
    this.submitted.set(true);
    if (Object.keys(this.formErrors()).length > 0) {
      focusFirstError(this.host.nativeElement);
      return;
    }
    const f = this.form;
    const data = new FormData();
    data.append('itemName', f.itemName.trim());
    data.append('category', f.category.trim());
    data.append('description', f.description.trim());
    data.append('uom', f.uom);
    data.append('sellingPrice', String(f.sellingPrice));
    if (f.mrp != null && String(f.mrp) !== '') data.append('mrp', String(f.mrp));
    data.append('quantity', String(f.quantity ?? 0));
    data.append('isActive', String(f.isActive));
    data.append('deliverySize', f.deliverySize);
    if (this.photo) data.append('image', this.photo);

    this.saving.set(true);
    this.marketplace.saveSellerItem(data, this.editingId() ?? undefined).subscribe({
      next: saved => {
        this.saving.set(false);
        this.showForm.set(false);
        this.toasts.success(this.editingId() ? 'Product updated.' : 'Product added. Customers can see it now.');
        this.products.update(list => {
          const rest = list.filter(x => x.itemId !== saved.itemId);
          return [saved, ...rest];
        });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(errorText(err));
      }
    });
  }

  ledgerLabel(row: LedgerRow): string {
    switch (row.entryType) {
      case 'SALE': return `Sale, order #${row.orderId}`;
      case 'PAYOUT': return 'Paid to your bank';
      default: return 'Adjustment';
    }
  }
}
