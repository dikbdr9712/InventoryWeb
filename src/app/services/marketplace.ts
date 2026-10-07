import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import {
  BalanceRow, LedgerRow, MarketplaceOverview, MarketplaceSettings, MyApplications, OrderPackage, Partner, PartnerHome,
  RiderApplication, SellerApplication, SellerItem
} from '../models/models';

// Everything for sellers, riders and running the marketplace. The server checks who may do what.
@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api`;

  // ---------- Anyone ----------
  settings() {
    return this.http.get<MarketplaceSettings>(`${this.api}/marketplace/settings`);
  }

  myApplications() {
    return this.http.get<MyApplications>(`${this.api}/marketplace/my-applications`);
  }

  // The application goes as a form with files: "application" (JSON) plus the documents
  applySeller(form: SellerApplication, files: { idDocument?: File | null; businessDocument?: File | null }) {
    return this.http.post<Partner>(`${this.api}/marketplace/apply/seller`, this.formWith(form, files));
  }

  applyRider(form: RiderApplication, files: { idDocument?: File | null; licenceDocument?: File | null }) {
    return this.http.post<Partner>(`${this.api}/marketplace/apply/rider`, this.formWith(form, files));
  }

  renewLicence(expiry: string, document: File) {
    const data = new FormData();
    data.append('expiry', expiry);
    data.append('document', document);
    return this.http.post<Partner>(`${this.api}/rider/licence`, data);
  }

  // admins only: opened in a new tab (the session cookie goes along)
  documentUrl(id: number) {
    return `${this.api}/marketplace/admin/documents/${id}`;
  }

  adjust(partyType: string, partyId: number, amount: number, reason: string, orderId: number | null) {
    return this.http.post<LedgerRow>(`${this.api}/marketplace/admin/adjustments`, { partyType, partyId, amount, reason, orderId });
  }

  private formWith(application: object, files: Record<string, File | null | undefined>) {
    const data = new FormData();
    data.append('application', new Blob([JSON.stringify(application)], { type: 'application/json' }));
    for (const [name, file] of Object.entries(files)) {
      if (file) data.append(name, file);
    }
    return data;
  }

  orderPackages(orderId: number) {
    return this.http.get<OrderPackage[]>(`${this.api}/orders/${orderId}/packages`);
  }

  // ---------- Seller ----------
  sellerHome() {
    return this.http.get<PartnerHome>(`${this.api}/seller/me`);
  }

  sellerPackages() {
    return this.http.get<OrderPackage[]>(`${this.api}/seller/packages`);
  }

  sellerPacked(id: number) {
    return this.http.post<OrderPackage>(`${this.api}/seller/packages/${id}/packed`, null);
  }

  // "Pick up myself": the customer collected it from the seller, with their collection code
  sellerHandOver(id: number, code: string) {
    return this.http.post<OrderPackage>(`${this.api}/seller/packages/${id}/handover`, { code });
  }

  sellerLedger() {
    return this.http.get<LedgerRow[]>(`${this.api}/seller/ledger`);
  }

  // the shop's pickup point on the map (delivery distances are measured from it)
  setSellerLocation(latitude: number, longitude: number) {
    return this.http.put<Partner>(`${this.api}/seller/location`, { latitude, longitude });
  }

  sellerItems() {
    return this.http.get<SellerItem[]>(`${this.api}/seller/items`);
  }

  saveSellerItem(form: FormData, id?: number) {
    return id
      ? this.http.put<SellerItem>(`${this.api}/seller/items/${id}`, form)
      : this.http.post<SellerItem>(`${this.api}/seller/items`, form);
  }

  // ---------- Rider ----------
  riderHome() {
    return this.http.get<PartnerHome>(`${this.api}/rider/me`);
  }

  openJobs() {
    return this.http.get<OrderPackage[]>(`${this.api}/rider/jobs`);
  }

  myJobs() {
    return this.http.get<OrderPackage[]>(`${this.api}/rider/my-jobs`);
  }

  riderAction(id: number, action: 'accept' | 'release' | 'pickup') {
    return this.http.post<OrderPackage>(`${this.api}/rider/jobs/${id}/${action}`, null);
  }

  riderDeliver(id: number, code: string) {
    return this.http.post<OrderPackage>(`${this.api}/rider/jobs/${id}/deliver`, { code });
  }

  riderLedger() {
    return this.http.get<LedgerRow[]>(`${this.api}/rider/ledger`);
  }

  // ---------- Staff: package board ----------
  allPackages(status?: string) {
    return this.http.get<OrderPackage[]>(`${this.api}/marketplace/packages`, { params: status ? { status } : {} });
  }

  staffAction(id: number, action: 'packed' | 'pickup' | 'deliver') {
    return this.http.post<OrderPackage>(`${this.api}/marketplace/packages/${id}/${action}`, null);
  }

  // ---------- Admin ----------
  overview() {
    return this.http.get<MarketplaceOverview>(`${this.api}/marketplace/admin/overview`);
  }

  saveSettings(settings: Omit<MarketplaceSettings, 'updatedAt' | 'updatedBy'>) {
    return this.http.put<MarketplaceSettings>(`${this.api}/marketplace/admin/settings`, settings);
  }

  partners() {
    return this.http.get<Partner[]>(`${this.api}/marketplace/admin/partners`);
  }

  setStatus(partner: Partner, status: 'APPROVED' | 'REJECTED' | 'SUSPENDED', note: string | null) {
    const kind = partner.type === 'SELLER' ? 'sellers' : 'riders';
    return this.http.put<Partner>(`${this.api}/marketplace/admin/${kind}/${partner.id}/status`, { status, note });
  }

  setCommission(sellerId: number, commissionPercent: number | null) {
    return this.http.put<Partner>(`${this.api}/marketplace/admin/sellers/${sellerId}/commission`, { commissionPercent });
  }

  balances() {
    return this.http.get<BalanceRow[]>(`${this.api}/marketplace/admin/balances`);
  }

  ledger(partyType: string, partyId: number) {
    return this.http.get<LedgerRow[]>(`${this.api}/marketplace/admin/ledger/${partyType}/${partyId}`);
  }

  payout(partyType: string, partyId: number, amount: number, reference: string) {
    return this.http.post<LedgerRow>(`${this.api}/marketplace/admin/payouts`, { partyType, partyId, amount, reference });
  }
}
