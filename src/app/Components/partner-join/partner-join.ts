import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { MarketplaceService } from '../../services/marketplace';
import { LegalService } from '../../services/legal';
import { ToastService } from '../../services/toast';
import { LegalTerms, MarketplaceSettings, Partner, RiderApplication, SellerApplication } from '../../models/models';
import { errorText } from '../../utils/http-error';
import { focusFirstError } from '../../utils/focus-error';
import { partnerLabel, partnerPill } from '../../utils/package-status';
import { TermsText } from '../terms-text/terms-text';

type Kind = 'seller' | 'rider';
type Step = 1 | 2 | 3;

const MAX_FILE = 5 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// "Sell with us" (/sell) and "Deliver with us" (/deliver): what it is, how it works, and the application in 3 steps:
//   1 Details   2 Documents (CID, licence)   3 Agreement (read, tick, send)
// The route's data says which one: { kind: 'seller' } or { kind: 'rider' }.
@Component({
  selector: 'app-partner-join',
  imports: [FormsModule, RouterLink, DecimalPipe, DatePipe, TermsText],
  templateUrl: './partner-join.html',
  styleUrl: './partner-join.css'
})
export class PartnerJoin implements OnInit {
  auth = inject(AuthService);
  private marketplace = inject(MarketplaceService);
  private legal = inject(LegalService);
  private toasts = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private host = inject(ElementRef);

  partnerLabel = partnerLabel;
  partnerPill = partnerPill;

  kind: Kind = this.route.snapshot.data['kind'] === 'rider' ? 'rider' : 'seller';
  isSeller = this.kind === 'seller';
  termsLink = this.isSeller ? '/terms/seller' : '/terms/driver';

  settings = signal<MarketplaceSettings | null>(null);
  terms = signal<LegalTerms | null>(null);
  termsError = signal(''); // the agreement could not be loaded (server down or being updated)
  loading = signal(true);
  mine = signal<Partner | null>(null);     // my application for this kind
  other = signal<Partner | null>(null);    // my application for the other kind (one account cannot be both)
  role = signal('');
  editing = signal(false);                 // showing the form
  step = signal<Step>(1);
  saving = signal(false);
  submitted = signal(false);               // errors of the current step are shown
  formError = signal('');

  // step 2: the files chosen
  idFile = signal<File | null>(null);
  licenceFile = signal<File | null>(null);
  businessFile = signal<File | null>(null);

  // step 3
  agreed = false;
  confirmTrue = false;

  seller: SellerApplication = {
    shopName: '', phone: '', pickupAddress: '', town: '', description: '', bankName: 'Bank of Bhutan', bankAccountName: '',
    bankAccountNumber: '', cidNumber: '', tradeLicenseNumber: '', tpnNumber: '', acceptedTermsVersion: null, confirmTrue: false
  };
  rider: RiderApplication = {
    phone: '', vehicleType: 'Motorbike', vehicleNumber: '', licenseNumber: '', town: '', bankName: 'Bank of Bhutan',
    bankAccountName: '', bankAccountNumber: '', cidNumber: '', licenseExpiry: '', emergencyContactName: '',
    emergencyContactPhone: '', acceptedTermsVersion: null, confirmTrue: false
  };

  readonly banks = ['Bank of Bhutan', 'Bhutan National Bank', 'Druk PNB Bank', 'T Bank', 'Bhutan Development Bank', 'Digital Kidu Bank'];
  readonly vehicles = ['Motorbike', 'Scooter', 'Car', 'Taxi', 'Pickup truck', 'Van', 'Bicycle', 'On foot'];

  // Which jobs a vehicle gets (the server decides the same way): a scooter never gets a washing machine
  jobsFor(vehicle: string) {
    const v = (vehicle || '').toLowerCase();
    if (/pickup|truck|van/.test(v)) return 'every job, including bulky ones like fridges and furniture';
    if (/car|taxi/.test(v)) return 'small, medium and large packages (no bulky ones)';
    if (/motor|scooter/.test(v)) return 'small and medium packages';
    return 'small packages only';
  }
  readonly towns = ['Thimphu', 'Paro', 'Phuentsholing', 'Punakha', 'Wangdue', 'Gelephu', 'Samdrup Jongkhar', 'Bumthang', 'Mongar', 'Trashigang'];
  readonly today = new Date().toISOString().slice(0, 10);

  // Same rule as the server: only customers (and existing sellers/riders) may apply
  isStaff = computed(() => !['USER', 'SELLER', 'RIDER', ''].includes((this.role() || this.auth.role() || '').toUpperCase()));

  // documents already on file (when sending a refused application again)
  hasDoc(kind: string) {
    return (this.mine()?.verification?.documents ?? []).some(d => d.kind === kind);
  }

  needsLicence() {
    return !this.isSeller && !['Bicycle', 'On foot'].includes(this.rider.vehicleType);
  }

  ngOnInit() {
    this.marketplace.settings().subscribe({ next: s => this.settings.set(s), error: () => {} });
    this.loadTerms();
    this.load();
  }

  loadTerms() {
    this.termsError.set('');
    this.legal.current(this.isSeller ? 'SELLER' : 'RIDER').subscribe({
      next: t => this.terms.set(t),
      error: (err: HttpErrorResponse) => this.termsError.set(err.status === 0
        ? 'The server is not answering right now.'
        : 'The agreement could not be loaded (' + errorText(err) + ').')
    });
  }

  private load() {
    if (!this.auth.isLoggedIn()) {
      this.loading.set(false);
      return;
    }
    this.marketplace.myApplications().subscribe({
      next: res => {
        this.role.set(res.role);
        const mine = this.isSeller ? res.seller : res.rider;
        this.mine.set(mine);
        this.other.set(this.isSeller ? res.rider : res.seller);
        if (mine) this.fill(mine);
        // approved since the last visit: bring the menus up to date
        if (mine?.status === 'APPROVED' && this.auth.role() !== (this.isSeller ? 'SELLER' : 'RIDER')) {
          this.auth.refresh().subscribe({ error: () => {} });
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  private fill(p: Partner) {
    const v = p.verification;
    if (this.isSeller) {
      this.seller = {
        ...this.seller,
        shopName: p.shopName ?? '', phone: p.phone ?? '', pickupAddress: p.pickupAddress ?? '', town: p.town ?? '',
        description: p.description ?? '', bankName: p.bankName ?? '', bankAccountName: p.bankAccountName ?? '',
        bankAccountNumber: p.bankAccountNumber ?? '', cidNumber: v?.cidNumber ?? '', tradeLicenseNumber: v?.tradeLicenseNumber ?? '',
        tpnNumber: v?.tpnNumber ?? ''
      };
    } else {
      this.rider = {
        ...this.rider,
        phone: p.phone ?? '', vehicleType: p.vehicleType ?? 'Motorbike', vehicleNumber: p.vehicleNumber ?? '',
        licenseNumber: p.licenseNumber ?? '', town: p.town ?? '', bankName: p.bankName ?? '', bankAccountName: p.bankAccountName ?? '',
        bankAccountNumber: p.bankAccountNumber ?? '', cidNumber: v?.cidNumber ?? '', licenseExpiry: v?.licenseExpiry ?? '',
        emergencyContactName: v?.emergencyContactName ?? '', emergencyContactPhone: v?.emergencyContactPhone ?? ''
      };
    }
  }

  start() {
    const phone = this.auth.phone() ?? '';
    if (!this.seller.phone) this.seller.phone = phone;
    if (!this.rider.phone) this.rider.phone = phone;
    if (!this.seller.bankAccountName) this.seller.bankAccountName = this.auth.name() ?? '';
    if (!this.rider.bankAccountName) this.rider.bankAccountName = this.auth.name() ?? '';
    this.step.set(1);
    this.submitted.set(false);
    this.agreed = false;
    this.confirmTrue = false;
    this.editing.set(true);
    this.scrollToForm();
  }

  private scrollToForm() {
    setTimeout(() => this.host.nativeElement.querySelector('#apply')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  // ---------- step 1 ----------
  detailErrors() {
    const e: Record<string, string> = {};
    const phoneOk = (v: string) => /^[0-9]{8}$/.test(v.trim());
    const cidOk = (v: string) => /^[0-9]{11}$/.test(v.replace(/\s/g, ''));
    const accountOk = (v: string) => /^[0-9]{6,20}$/.test(v.replace(/\s/g, ''));
    if (this.isSeller) {
      const f = this.seller;
      if (!f.shopName.trim()) e['shopName'] = 'Enter your shop name.';
      if (!phoneOk(f.phone)) e['phone'] = 'Enter an 8-digit phone number.';
      if (!cidOk(f.cidNumber)) e['cidNumber'] = 'Enter the owner\'s 11-digit CID number.';
      if (!f.pickupAddress.trim()) e['pickupAddress'] = 'Tell drivers where to collect the packages.';
      if (!f.town.trim()) e['town'] = 'Choose your town.';
      if (!f.bankAccountName.trim()) e['bankAccountName'] = 'Enter the name on the account.';
      if (!accountOk(f.bankAccountNumber)) e['bankAccountNumber'] = 'Enter the account number (digits only).';
    } else {
      const f = this.rider;
      if (!phoneOk(f.phone)) e['phone'] = 'Enter an 8-digit phone number.';
      if (!cidOk(f.cidNumber)) e['cidNumber'] = 'Enter your 11-digit CID number.';
      if (!f.town.trim()) e['town'] = 'Choose the town you deliver in.';
      if (this.needsLicence()) {
        if (!f.licenseNumber.trim()) e['licenseNumber'] = 'Enter your driving licence number.';
        if (!f.licenseExpiry) e['licenseExpiry'] = 'Enter the date your licence expires.';
        else if (f.licenseExpiry <= this.today) e['licenseExpiry'] = 'Your licence has expired. Renew it first.';
      }
      if (!f.emergencyContactName.trim()) e['emergencyContactName'] = 'Who should we call in an emergency?';
      if (!phoneOk(f.emergencyContactPhone)) e['emergencyContactPhone'] = 'Enter an 8-digit phone number.';
      else if (f.emergencyContactPhone.trim() === f.phone.trim()) e['emergencyContactPhone'] = 'Use a different number from yours.';
      if (!f.bankAccountName.trim()) e['bankAccountName'] = 'Enter the name on the account.';
      if (!accountOk(f.bankAccountNumber)) e['bankAccountNumber'] = 'Enter the account number (digits only).';
    }
    return e;
  }

  // ---------- step 2 ----------
  docErrors() {
    const e: Record<string, string> = {};
    if (!this.idFile() && !this.hasDoc('ID_CARD')) e['id'] = 'Add a clear photo or scan of the CID card (front).';
    if (this.needsLicence() && !this.licenceFile() && !this.hasDoc('DRIVING_LICENCE')) e['licence'] = 'Add a photo or scan of your driving licence.';
    return e;
  }

  pick(which: 'id' | 'licence' | 'business', input: HTMLInputElement) {
    const file = input.files?.[0] ?? null;
    if (file && !FILE_TYPES.includes(file.type)) {
      this.toasts.error('Choose a photo (JPG or PNG) or a PDF.');
      input.value = '';
      return;
    }
    if (file && file.size > MAX_FILE) {
      this.toasts.error('That file is bigger than 5 MB. Take a smaller photo.');
      input.value = '';
      return;
    }
    ({ id: this.idFile, licence: this.licenceFile, business: this.businessFile })[which].set(file);
  }

  size(file: File) {
    return file.size > 1024 * 1024 ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : Math.round(file.size / 1024) + ' KB';
  }

  // ---------- moving between steps ----------
  next() {
    this.submitted.set(true);
    const errors = this.step() === 1 ? this.detailErrors() : this.docErrors();
    if (Object.keys(errors).length > 0) {
      focusFirstError(this.host.nativeElement);
      return;
    }
    this.submitted.set(false);
    this.step.set((this.step() + 1) as Step);
    this.scrollToForm();
  }

  back() {
    this.submitted.set(false);
    this.step.set(Math.max(1, this.step() - 1) as Step);
    this.scrollToForm();
  }

  goTo(step: Step) {
    if (step < this.step()) {
      this.step.set(step);
      this.submitted.set(false);
    }
  }

  // ---------- step 3: send ----------
  submit() {
    if (this.saving()) return;
    this.formError.set('');
    const t = this.terms();
    if (!t) {
      this.formError.set('The agreement could not be loaded. Please reload the page.');
      return;
    }
    if (!this.agreed || !this.confirmTrue) {
      this.submitted.set(true);
      return;
    }
    this.saving.set(true);
    const request = this.isSeller
      ? this.marketplace.applySeller(
          { ...this.seller, acceptedTermsVersion: t.version, confirmTrue: this.confirmTrue },
          { idDocument: this.idFile(), businessDocument: this.businessFile() })
      : this.marketplace.applyRider(
          { ...this.rider, licenseExpiry: this.rider.licenseExpiry || '', acceptedTermsVersion: t.version, confirmTrue: this.confirmTrue },
          { idDocument: this.idFile(), licenceDocument: this.licenceFile() });
    request.subscribe({
      next: partner => {
        this.saving.set(false);
        this.mine.set(partner);
        this.editing.set(false);
        this.idFile.set(null);
        this.licenceFile.set(null);
        this.businessFile.set(null);
        this.toasts.success('Application sent. We will check your details and documents.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(errorText(err));
        // the agreement may have changed meanwhile: load the latest so the person reads it
        this.legal.current(this.isSeller ? 'SELLER' : 'RIDER').subscribe({
          next: latest => {
            if (latest.version !== t.version) {
              this.terms.set(latest);
              this.agreed = false;
            }
          }
        });
      }
    });
  }

  openHub() {
    this.auth.refresh().subscribe({
      next: () => this.router.navigate([this.isSeller ? '/seller' : '/rider']),
      error: () => this.router.navigate([this.isSeller ? '/seller' : '/rider'])
    });
  }
}
