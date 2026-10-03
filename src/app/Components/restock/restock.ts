import { Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ItemService } from '../../services/item';
import { ToastService } from '../../services/toast';
import { Item, RestockRequest } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { focusFirstError } from '../../utils/focus-error';

interface AddedSummary {
  name: string;
  quantity: number;
  total: number;
  stock: number | null; // stock level after the delivery, when the server tells us
}

interface PickedItem {
  sku: string;
  itemName: string;
  image?: string;
  stock?: number | null;
  sellingPrice?: number | null;
  costPrice?: number | null;   // the last cost (only for people who may see costs)
}

// Record stock coming in from a supplier.
// From a product card: /restock?sku=ABC-01&itemName=Apple
@Component({
  selector: 'app-restock',
  imports: [FormsModule, DecimalPipe, RouterLink],
  templateUrl: './restock.html',
  styleUrl: './restock.css'
})
export class Restock implements OnInit {
  private itemService = inject(ItemService);
  private route = inject(ActivatedRoute);
  private toasts = inject(ToastService);
  private host = inject(ElementRef);
  private searchWrap = viewChild<ElementRef<HTMLElement>>('searchWrap');
  private searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  // Step 1: which item
  searchText = '';
  suggestions = signal<Item[]>([]);
  noMatchTerm = signal('');
  showSuggestions = signal(false);
  selected = signal<PickedItem | null>(null);
  isNewItem = signal(false);
  private searchCount = 0; // ignore old search results that arrive late

  newItem = {
    sku: '',
    itemName: '',
    description: '',
    uom: 'nbr',
    pricePerUnit: null as number | null,
    barcode: '',
    supplierItemCode: ''
  };

  // Step 2: the delivery
  purchase = {
    quantity: null as number | null,
    unitPrice: null as number | null,
    supplier: '',
    notes: '',
    batchNo: '',
    expiryDate: '',                       // yyyy-mm-dd, optional
    changePrice: false,
    newSellingPrice: null as number | null
  };
  readonly today = new Date().toISOString().slice(0, 10);

  // ---------- Margin: is the selling price still right for what this delivery cost? ----------
  margin() {
    const item = this.selected();
    const cost = Number(this.purchase.unitPrice);
    const sell = Number(item?.sellingPrice);
    if (!item || this.isNewItem() || !(cost > 0) || !(sell > 0)) return null;
    const pct = (s: number, c: number) => Math.round(((s - c) / s) * 1000) / 10;
    const lastCost = Number(item.costPrice) || null;
    const lastMargin = lastCost ? pct(sell, lastCost) : null;
    // the price that keeps the margin we had with the last cost (whole Nu.)
    const keepMargin = lastMargin != null && lastMargin < 100 ? Math.ceil(cost / (1 - lastMargin / 100)) : null;
    return {
      sell,
      cost,
      margin: pct(sell, cost),
      lastCost,
      lastMargin,
      dearer: lastCost != null && cost > lastCost,
      cheaper: lastCost != null && cost < lastCost,
      loss: cost >= sell,
      suggested: keepMargin && keepMargin > sell ? keepMargin : null
    };
  }

  toggleChangePrice(on: boolean) {
    this.purchase.changePrice = on;
    if (on && this.purchase.newSellingPrice == null) {
      const m = this.margin();
      this.purchase.newSellingPrice = m?.suggested ?? m?.sell ?? null;
    }
  }

  saving = signal(false);
  submitted = signal(false);
  lastAdded = signal<AddedSummary | null>(null); // stays on screen until dismissed
  justSaved = signal(false); // true for a moment after a save, so an extra click does nothing

  // The name shown in the summary
  itemLabel = computed(() => {
    if (this.isNewItem()) return this.newItem.itemName.trim() || 'New item';
    return this.selected()?.itemName ?? '';
  });

  ngOnInit() {
    // Arriving from a product card: the item is already chosen
    const params = this.route.snapshot.queryParamMap;
    const sku = params.get('sku');
    if (sku) {
      this.selected.set({ sku, itemName: params.get('itemName') ?? sku });
    }
  }

  // ---------- Step 1: find the item ----------
  onSearch(term: string) {
    this.searchText = term;
    this.showSuggestions.set(false);
    this.suggestions.set([]);
    this.noMatchTerm.set('');

    const trimmed = term.trim();
    if (trimmed.length < 2) return;

    const thisSearch = ++this.searchCount;
    this.itemService.search(trimmed).subscribe({
      next: items => {
        if (thisSearch !== this.searchCount) return; // a newer search is running
        this.suggestions.set(items);
        this.noMatchTerm.set(items.length === 0 ? trimmed : '');
        this.showSuggestions.set(true);
      },
      error: (err: HttpErrorResponse) => this.toasts.error('Search failed: ' + errorText(err))
    });
  }

  pick(item: Item) {
    this.selected.set({
      sku: item.sku ?? '',
      itemName: item.itemName,
      image: this.itemService.imageFor(item),
      stock: this.itemService.stockOf(item),
      sellingPrice: item.sellingPrice ?? null,
      costPrice: item.costPrice ?? null
    });
    this.purchase.changePrice = false;
    this.purchase.newSellingPrice = null;
    this.isNewItem.set(false);
    this.showSuggestions.set(false);
    this.searchText = '';
  }

  startNewItem(term: string) {
    this.selected.set(null);
    this.newItem.sku = term;
    this.isNewItem.set(true);
    this.showSuggestions.set(false);
    this.searchText = '';
  }

  changeItem() {
    this.selected.set(null);
    this.isNewItem.set(false);
    setTimeout(() => this.searchBox()?.nativeElement.focus(), 0);
  }

  // Close the suggestions when clicking outside the search box
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const wrap = this.searchWrap()?.nativeElement;
    if (wrap && !wrap.contains(event.target as Node)) this.showSuggestions.set(false);
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('Images/default.jpg')) img.src = 'Images/default.jpg';
  }

  // ---------- Totals and checks ----------
  get quantityValue(): number {
    return Math.trunc(Number(this.purchase.quantity)) || 0;
  }

  get totalCost(): number {
    return this.quantityValue * (Number(this.purchase.unitPrice) || 0);
  }

  errors() {
    const e: { item?: string; sku?: string; name?: string; quantity?: string; price?: string; supplier?: string;
               expiry?: string; newPrice?: string } = {};

    if (!this.selected() && !this.isNewItem()) e.item = 'Choose the item you are restocking.';
    if (this.isNewItem()) {
      if (!this.newItem.sku.trim()) e.sku = 'Enter a code (SKU) for the new item.';
      if (!this.newItem.itemName.trim()) e.name = 'Enter a name for the new item.';
    }
    if (!(this.quantityValue > 0)) e.quantity = 'Enter how many arrived (1 or more).';
    if (this.purchase.unitPrice == null || isNaN(Number(this.purchase.unitPrice)) || Number(this.purchase.unitPrice) < 0) {
      e.price = 'Enter what you paid for one.';
    }
    if (!this.purchase.supplier.trim()) e.supplier = 'Enter who supplied it.';
    if (this.purchase.expiryDate && this.purchase.expiryDate < this.today) {
      e.expiry = 'This date has passed: expired stock cannot be put on sale.';
    }
    if (this.purchase.changePrice && !(Number(this.purchase.newSellingPrice) > 0)) {
      e.newPrice = 'Enter the new selling price.';
    }
    return e;
  }

  // ---------- Save ----------
  submit() {
    if (this.saving() || this.justSaved()) return;

    this.submitted.set(true);
    if (Object.keys(this.errors()).length > 0) {
      this.toasts.error('Some details are missing. The first one is highlighted.');
      focusFirstError(this.host.nativeElement);
      return;
    }

    const quantity = this.quantityValue;
    const unitPrice = Number(this.purchase.unitPrice);
    const notes = this.purchase.notes.trim() || null;
    const supplier = this.purchase.supplier.trim();
    const picked = this.selected();
    const batch = {
      batchNo: this.purchase.batchNo.trim() || null,
      expiryDate: this.purchase.expiryDate || null,
      newSellingPrice: this.purchase.changePrice && !this.isNewItem() ? Number(this.purchase.newSellingPrice) : null
    };

    // These field names are what your backend expects. Do not rename them.
    let request: RestockRequest;
    if (picked && !this.isNewItem()) {
      request = { sku: picked.sku, quantity, unitPrice, customerOrSupplier: supplier, notes, ...batch };
    } else {
      request = {
        sku: this.newItem.sku.trim(),
        itemName: this.newItem.itemName.trim(),
        quantity,
        unitPrice,
        customerOrSupplier: supplier,
        notes,
        description: this.newItem.description.trim() || null,
        uom: this.newItem.uom || 'nbr',
        sellingPrice: this.newItem.pricePerUnit != null ? Number(this.newItem.pricePerUnit) : null,
        barcode: this.newItem.barcode.trim() || null,
        supplierItemCode: this.newItem.supplierItemCode.trim() || null,
        ...batch
      };
    }

    const label = this.itemLabel();
    const sku = request.sku;
    this.saving.set(true);
    this.itemService.restock(request).subscribe({
      next: () => {
        this.saving.set(false);
        this.lastAdded.set({ name: label, quantity, total: quantity * unitPrice, stock: null });
        this.reset();
        window.scrollTo({ top: 0, behavior: 'smooth' }); // the confirmation is at the top

        // Right after saving, a second click on the button is almost always an accident
        this.justSaved.set(true);
        setTimeout(() => this.justSaved.set(false), 2000);

        // Ready for the next item: put the cursor in the search box
        setTimeout(() => this.searchBox()?.nativeElement.focus({ preventScroll: true }), 50);

        // Find the item, then read its stock level to show in the confirmation
        this.itemService.search(sku).subscribe({
          next: items => {
            const match = items.find(i => i.sku === sku);
            if (!match) return;
            this.itemService.getById(match.itemId).subscribe({
              next: item => {
                const stock = this.itemService.stockOf(item);
                this.lastAdded.update(current => (current ? { ...current, stock } : current));
              },
              error: () => { /* the confirmation is still correct without it */ }
            });
          },
          error: () => { /* the confirmation is still correct without it */ }
        });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.toasts.error('We could not record the stock: ' + errorText(err));
      }
    });
  }

  // Ready for the next delivery
  private reset() {
    this.searchText = '';
    this.selected.set(null);
    this.isNewItem.set(false);
    this.submitted.set(false);
    this.newItem = { sku: '', itemName: '', description: '', uom: 'nbr', pricePerUnit: null, barcode: '', supplierItemCode: '' };
    // same supplier is likely; a new batch number and date for the next product
    this.purchase = { quantity: null, unitPrice: null, supplier: this.purchase.supplier, notes: '', batchNo: '', expiryDate: '',
      changePrice: false, newSellingPrice: null };
  }
}
