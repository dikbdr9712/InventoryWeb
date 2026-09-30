import { Component, ElementRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ItemService } from '../../services/item';
import { ToastService } from '../../services/toast';
import { errorText } from '../../utils/http-error';
import { focusFirstError } from '../../utils/focus-error';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// One form for both:
//   /products/new       -> add a product
//   /products/edit/:id  -> edit a product
@Component({
  selector: 'app-product-form',
  imports: [FormsModule, DecimalPipe, RouterLink],
  templateUrl: './product-form.html',
  styleUrl: './product-form.css'
})
export class ProductForm implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private itemService = inject(ItemService);
  private toasts = inject(ToastService);
  private host = inject(ElementRef);

  isEdit = false;
  itemId = 0;
  selectedFile: File | null = null;
  uomOptions = ['pcs', 'kg', 'ltr', 'box'];

  model = {
    itemName: '',
    description: '',
    category: '',
    uom: 'pcs',
    costPrice: null as number | null,
    pricingMethod: 'sellingPrice' as 'sellingPrice' | 'markupPercent',
    pricingInput: null as number | null,
    mrp: null as number | null,
    quantity: 0 as number | null,
    lowStockThreshold: 10 as number | null,
    barcode: '',
    supplierItemCode: ''
  };

  loaded = signal(false);
  loadError = signal('');
  saving = signal(false);
  submitted = signal(false); // field errors only show after the first attempt
  // Set after a NEW product is saved: shows a confirmation that stays until the person moves on
  created = signal<{ name: string; price: number; stock: number } | null>(null);
  categories = signal<string[]>([]);

  imageUrl = signal('Images/default.jpg');
  private originalImage = 'Images/default.jpg';
  fileError = signal('');

  get isMarkup() {
    return this.model.pricingMethod === 'markupPercent';
  }

  get costPriceValue(): number {
    return Number(this.model.costPrice) || 0;
  }

  ngOnInit() {
    // Existing categories, offered as suggestions so the same one is not typed two ways
    this.itemService.getAll().subscribe({
      next: items => {
        const names = items.map(i => (i.category || '').trim()).filter(Boolean);
        this.categories.set([...new Set(names)].sort((a, b) => a.localeCompare(b)));
      },
      error: () => this.categories.set([])
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    this.isEdit = idParam !== null;

    if (!this.isEdit) {
      this.loaded.set(true);
      return;
    }

    this.itemId = Number(idParam);
    if (!this.itemId) {
      this.loadError.set('This product link is not valid.');
      return;
    }

    this.itemService.getById(this.itemId).subscribe({
      next: item => {
        const uom = item.uom ?? 'pcs';
        if (!this.uomOptions.includes(uom)) this.uomOptions.push(uom); // keep old values like 'liter'

        this.model = {
          itemName: item.itemName ?? '',
          description: item.description ?? '',
          category: item.category ?? '',
          uom,
          costPrice: Number(item.costPrice) || 0,
          pricingMethod: 'sellingPrice', // the server stores the final price
          pricingInput: item.sellingPrice != null ? Number(Number(item.sellingPrice).toFixed(2)) : null,
          mrp: item.mrp ?? null,
          quantity: item.currentQuantity ?? item.currentStock ?? item.quantity ?? 0,
          lowStockThreshold: item.lowStockThreshold ?? 10,
          barcode: item.barcode ?? '',
          supplierItemCode: item.supplierItemCode ?? ''
        };
        this.originalImage = this.itemService.imageUrl(item.imagePath);
        this.imageUrl.set(this.originalImage);
        this.loaded.set(true);
      },
      error: () => this.loadError.set('We could not load this product. It may have been removed.')
    });
  }

  // ---------- Photo ----------
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.fileError.set('');
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.fileError.set('Choose an image file, such as a JPG or PNG.');
      input.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.fileError.set('That image is over 2 MB. Choose a smaller one.');
      input.value = '';
      return;
    }

    this.selectedFile = file;
    this.imageUrl.set(URL.createObjectURL(file)); // preview before saving
  }

  removeNewImage(input: HTMLInputElement) {
    this.selectedFile = null;
    input.value = '';
    this.fileError.set('');
    this.imageUrl.set(this.originalImage);
  }

  // ---------- Price ----------
  // Same rules as before: the selling price is rounded DOWN to 2 decimals
  private priceResult(): { price?: number; error?: string } {
    const raw = this.model.pricingInput;
    const value = Number(raw);
    if (raw == null || isNaN(value)) {
      return { error: this.isMarkup ? 'Enter the markup percentage.' : 'Enter the selling price.' };
    }
    if (this.isMarkup) {
      if (this.costPriceValue <= 0) return { error: 'Markup needs a cost price above 0. Enter the cost price, or type the selling price instead.' };
      if (value < 0) return { error: 'Markup cannot be negative.' };
      return { price: Math.floor(this.costPriceValue * (1 + value / 100) * 100) / 100 };
    }
    if (value <= 0) return { error: 'The selling price must be more than 0.' };
    return { price: Math.floor(value * 100) / 100 };
  }

  // Shown live under the price fields
  get preview() {
    const selling = this.priceResult().price;
    if (selling === undefined) return null;
    const mrp = this.model.mrp != null ? Number(this.model.mrp) : selling;
    const discount = mrp > selling ? Math.round(((mrp - selling) / mrp) * 1000) / 10 : 0;
    const cost = this.costPriceValue;
    const profit = cost > 0 ? selling - cost : null;
    const margin = profit !== null && selling > 0 ? Math.round((profit / selling) * 1000) / 10 : null;
    return { mrp, selling, discount, profit, margin };
  }

  setMethod(method: 'sellingPrice' | 'markupPercent') {
    this.model.pricingMethod = method;
  }

  // ---------- Validation ----------
  errors() {
    const e: { name?: string; cost?: string; category?: string; price?: string; stock?: string } = {};
    if (!this.model.itemName.trim()) e.name = 'Enter the product name.';
    if (!this.isEdit) {
      if (this.model.costPrice == null || this.costPriceValue < 0) e.cost = 'Enter the cost price (0 or more).';
      if (!this.model.category.trim()) e.category = 'Enter a category.';
    }
    const price = this.priceResult();
    if (price.error) e.price = price.error;
    if (this.model.quantity == null || Number(this.model.quantity) < 0) e.stock = 'Stock cannot be negative.';
    return e;
  }

  // ---------- Save ----------
  save() {
    if (this.saving()) return;

    this.submitted.set(true);
    if (Object.keys(this.errors()).length > 0 || this.fileError()) {
      this.toasts.error('Some details are missing or need fixing. The first one is highlighted.');
      focusFirstError(this.host.nativeElement);
      return;
    }

    const sellingPrice = this.priceResult().price as number;
    const mrp = this.model.mrp != null ? Number(this.model.mrp) : sellingPrice;

    // These field names are what your backend expects. Do not rename them.
    const data = new FormData();
    if (this.isEdit) data.append('itemId', String(this.itemId));
    data.append('itemName', this.model.itemName.trim());
    data.append('description', this.model.description.trim());
    data.append('uom', this.model.uom || 'pcs');
    data.append('sellingPrice', sellingPrice.toFixed(2));
    data.append('mrp', mrp.toFixed(2));
    if (!this.isEdit || this.costPriceValue > 0) data.append('costPrice', this.costPriceValue.toFixed(2));
    if (!this.isEdit) {
      data.append('category', this.model.category.trim());
      if (this.isMarkup) data.append('markupPercent', Number(this.model.pricingInput).toFixed(2));
    }
    data.append('barcode', this.model.barcode.trim());
    data.append('supplierItemCode', this.model.supplierItemCode.trim());
    data.append('quantity', String(Math.trunc(Number(this.model.quantity) || 0)));
    data.append('lowStockThreshold', String(Math.trunc(Number(this.model.lowStockThreshold) || 10)));
    // Your backend uses "images" when adding and "image" when editing
    if (this.selectedFile) data.append(this.isEdit ? 'image' : 'images', this.selectedFile);

    const request = this.isEdit
      ? this.itemService.update(this.itemId, data)
      : this.itemService.create(data);

    // Remember what was saved, because the form is cleared afterwards
    const saved = {
      name: this.model.itemName.trim(),
      price: sellingPrice,
      stock: Math.trunc(Number(this.model.quantity) || 0),
      category: this.model.category.trim()
    };

    this.saving.set(true);
    request.subscribe({
      next: () => {
        this.saving.set(false);

        if (this.isEdit) {
          // Editing: go back to the list, with a short message
          this.toasts.success('Product updated.');
          this.router.navigate(['/products']);
          return;
        }

        // Adding: stay here and show a clear confirmation
        if (saved.category && !this.categories().includes(saved.category)) {
          this.categories.update(list => [...list, saved.category].sort((a, b) => a.localeCompare(b)));
        }
        this.created.set({ name: saved.name, price: saved.price, stock: saved.stock });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toasts.error('We could not save the product: ' + errorText(err));
      }
    });
  }

  // "Add another product": clear the form, but keep the category, unit and warning level,
  // because products added one after another are often alike
  addAnother() {
    const keep = {
      category: this.model.category,
      uom: this.model.uom,
      lowStockThreshold: this.model.lowStockThreshold
    };
    this.model = {
      itemName: '',
      description: '',
      category: keep.category,
      uom: keep.uom,
      costPrice: null,
      pricingMethod: 'sellingPrice',
      pricingInput: null,
      mrp: null,
      quantity: 0,
      lowStockThreshold: keep.lowStockThreshold,
      barcode: '',
      supplierItemCode: ''
    };
    this.selectedFile = null;
    this.fileError.set('');
    this.originalImage = 'Images/default.jpg';
    this.imageUrl.set(this.originalImage);
    this.submitted.set(false);
    this.created.set(null);
    window.scrollTo({ top: 0 });
  }

  goBack() {
    this.location.back();
  }
}
