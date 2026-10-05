// ---------- Auth ----------
export interface LoginResponse {
  email: string;
  name: string;
  phone: string;
  role: string;
  permissions?: string[]; // from the server: what this person may do
}

export interface SignupRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
  acceptedTermsVersion: number | null; // the Terms of Use and Privacy version ticked "I agree"
}

// ---------- Contact ----------
export interface ContactMessage {
  id?: number;
  name: string;
  email: string;
  message: string;
  submittedAt?: string;
}

// ---------- Items ----------
export interface Item {
  itemId: number;
  itemName: string;
  sku?: string;
  description?: string;
  category?: string;
  uom?: string;
  barcode?: string;
  supplierItemCode?: string;
  costPrice?: number;
  sellingPrice?: number;
  mrp?: number;
  quantity?: number;
  currentStock?: number;
  currentQuantity?: number;
  lowStockThreshold?: number;
  availability?: string;
  imagePath?: string;
  sellerId?: number | null;   // marketplace seller; empty = our own product
  sellerName?: string;        // "Sold by ..."
  deliverySize?: DeliverySize; // decides the delivery price and which riders can carry it
}

export interface RestockRequest {
  sku: string;
  quantity: number;
  unitPrice: number;
  customerOrSupplier: string;
  notes: string | null;
  // only for new items
  itemName?: string;
  description?: string | null;
  uom?: string;
  sellingPrice?: number | null;
  barcode?: string | null;
  supplierItemCode?: string | null;
  // this delivery's batch (optional) and, optionally, a new selling price for the product
  batchNo?: string | null;
  expiryDate?: string | null;     // yyyy-mm-dd
  newSellingPrice?: number | null;
}

// ---------- Cart ----------
export interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  image: string;
  sellerId?: number | null;  // marketplace seller (empty = our own shop): one delivery per seller
  sellerName?: string;
}

// ---------- Orders ----------
// Order from the cart
export interface OrderRequest {
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  address?: string;
  totalAmount: number;
  items: { itemId: number; quantity: number; price: number }[];
  // where to deliver on the map (see DeliveryPoint)
  dropLatitude?: number | null;
  dropLongitude?: number | null;
  areaId?: number | null;
}

// Order from "Buy Now"
export interface DirectOrderRequest {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  totalAmount: number;
  orderStatus: string;
  items: { itemId: number; quantity: number; unitPrice: number }[];
  dropLatitude?: number | null;
  dropLongitude?: number | null;
  areaId?: number | null;
}

export interface Order {
  orderId: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  address?: string;
  note?: string; // the shop's message to the customer (why info is needed, why a payment was refused)
  totalAmount: number;
  deliveryFee?: number | null; // included in totalAmount (marketplace orders)
  orderStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  paymentReference?: string | null; // counter sales: journal number / card approval code / UPI number
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface OrderItem {
  itemName?: string;
  quantity?: number;
  unitPrice?: number;
  uom?: string;
  imagePath?: string;
}

// Admin order list (/api/admin/orders)
export interface AdminOrderItem {
  itemName?: string;
  uom?: string;
  quantityOrdered?: number;
  stockAvailable?: number;
  unitPrice?: number;
}

export interface AdminOrder extends Order {
  items?: AdminOrderItem[];
  source?: string;              // ONLINE or POS (counter sales are in Sales history)
  paymentSubmitted?: boolean;   // the customer sent a payment that waits to be checked
  journalNumber?: string | null;
  paymentAmount?: number | null;
  hasPackages?: boolean;        // goes out package by package (the order board)
}

export type OrderAction = 'confirm-payment' | 'confirm' | 'cancel' | 'ship' | 'complete';

// ---------- Payments ----------
export interface PaymentRequest {
  orderId: number;
  amount: number;
  paymentMethod: string;
  status: string;
  journalNumber: string | null;
}

export interface PaymentRecord {
  paymentId?: number;
  id?: number;
  paymentMethod?: string;
  journalNumber?: string;
  amount?: number;
}

// ---------- POS ----------
export interface PosTax {
  type: string;
  rate: number;
  manuallyEdited: boolean;
}

export interface PosSaleRequest {
  clientRef: string;              // the till's id for this sale: sending it twice saves it once
  amountTendered: number | null;  // cash handed over (cash sales)
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string;
  paymentReference: string | null; // journal number (bank transfer, required), card approval code or UPI number
  taxes: { type: string; rate: number }[];
  items: { itemId: number; quantity: number; mrp: number; discountPercent: number }[];
}

// ---------- Sales reports ----------
export interface SalesRow {
  date: string;
  totalSales: number;
  totalOrders: number;
  totalTax: number;
  totalDiscount: number;
}

export interface SalesSummary {
  totalSales: number;
  totalOrders: number;
  totalTax: number;
  totalDiscount: number;
}

// ---------- Users (admin) ----------
export interface AppUser {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: string | { name?: string } | null;
}

// ---------- Marketplace: sellers, riders, packages ----------
export type PartnerStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface MarketplaceSettings {
  defaultCommissionPercent: number;
  rates: DeliveryRate[];          // one per size: fee = base fee + (km beyond includedKm) x per km
  includedKm: number;
  riderSharePercent: number;      // the rider's part of each delivery fee
  maxDistanceKm: number;
  unknownDistanceKm: number;      // used when the customer gives no location
  shopAddress?: string | null;    // our own shop's pickup point
  shopLatitude?: number | null;
  shopLongitude?: number | null;
  updatedAt?: string;
  updatedBy?: string;
}

// ---------- Delivery: size, distance and price ----------
export type DeliverySize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'BULKY';

export interface DeliveryRate {
  size: DeliverySize;
  label?: string;
  vehicle?: string;
  baseFee: number;
  perKm: number;
}

// Where the customer wants it: the phone's location or a delivery area (or nothing = estimated price)
export interface DeliveryPoint {
  latitude?: number | null;
  longitude?: number | null;
  areaId?: number | null;
  label?: string;           // shown to the customer: "Your location" or the area's name
}

export interface PackageQuote {
  sellerName: string;
  town?: string | null;
  size: DeliverySize;
  sizeLabel: string;
  vehicle: string;
  distanceKm: number;
  estimated: boolean;
  fee: number;
}

export interface DeliveryQuote {
  packages: PackageQuote[];
  totalFee: number;
  location?: string | null;
  located: boolean;
  problem?: string | null;  // for example "too far": the order cannot be placed
}

export interface DeliveryArea {
  id: number;
  name: string;
  town: string;
  latitude?: number;
  longitude?: number;
  active?: boolean;
}

export interface SellerApplication {
  shopName: string;
  phone: string;
  pickupAddress: string;
  town: string;
  description: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  cidNumber: string;
  tradeLicenseNumber: string;
  tpnNumber: string;
  acceptedTermsVersion: number | null;
  confirmTrue: boolean;
}

export interface RiderApplication {
  phone: string;
  vehicleType: string;
  vehicleNumber: string;
  licenseNumber: string;
  town: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  cidNumber: string;
  licenseExpiry: string;          // yyyy-mm-dd
  emergencyContactName: string;
  emergencyContactPhone: string;
  acceptedTermsVersion: number | null;
  confirmTrue: boolean;
}

// A seller or a rider (type tells which)
export interface Partner {
  id: number;
  type: 'SELLER' | 'RIDER';
  status: PartnerStatus;
  statusNote?: string;
  name: string;
  email: string;
  phone?: string;
  shopName?: string;
  pickupAddress?: string;
  town?: string;
  description?: string;
  pickupLatitude?: number | null;   // the seller's pickup point on the map
  pickupLongitude?: number | null;
  vehicleType?: string;
  vehicleNumber?: string;
  licenseNumber?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  commissionPercent?: number | null;
  effectiveCommissionPercent?: number | null;
  createdAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  verification?: PartnerVerification;
}

export interface MyApplications {
  seller: Partner | null;
  rider: Partner | null;
  role: string;
}

export type PackageStatus = 'PENDING_PAYMENT' | 'TO_PACK' | 'READY_FOR_PICKUP' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED';

export interface PackageLine {
  itemId: number;
  itemName: string;
  imagePath?: string;
  quantity: number;
  unitPrice: number;
}

// Fields are empty when the person looking may not see them
export interface OrderPackage {
  id: number;
  orderId: number;
  status: PackageStatus;
  sellerId?: number | null;
  sellerName?: string;
  sellerPhone?: string;
  pickupAddress?: string;
  pickupTown?: string;
  customerName?: string;
  customerPhone?: string;
  dropAddress?: string;
  riderId?: number | null;
  riderName?: string;
  riderPhone?: string;
  riderVehicle?: string;
  itemsSubtotal?: number;
  commissionPercent?: number;
  commissionAmount?: number;
  sellerEarning?: number;
  deliveryFee?: number;
  riderPay?: number;
  deliverySize?: DeliverySize;
  distanceKm?: number | null;
  distanceEstimated?: boolean;    // a map point was missing: the distance is a standard guess
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;
  dropLatitude?: number | null;   // only for the rider on the job and staff
  dropLongitude?: number | null;
  deliveryCode?: string;
  itemCount: number;
  items: PackageLine[];
  createdAt?: string;
  packedAt?: string;
  assignedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
}

export interface EarningsSummary {
  balanceOwed: number;
  totalEarned: number;
  totalPaidOut: number;
  upcoming: number;
  deliveredCount: number;
  activeCount: number;
}

export interface LedgerRow {
  id: number;
  entryType: 'SALE' | 'DELIVERY' | 'PAYOUT' | 'ADJUSTMENT';
  amount: number;
  orderId?: number;
  packageId?: number;
  note?: string;
  createdAt?: string;
  createdBy?: string;
}

export interface PartnerHome {
  profile: Partner;
  earnings: EarningsSummary;
}

export interface BalanceRow {
  partyType: 'SELLER' | 'RIDER';
  partyId: number;
  name: string;
  email: string;
  status: PartnerStatus;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  balanceOwed: number;
  totalEarned: number;
  totalPaidOut: number;
}

export interface MarketplaceOverview {
  pendingApplications: number;
  approvedSellers: number;
  approvedRiders: number;
  packagesToPack: number;
  packagesReady: number;
  packagesOnTheWay: number;
  commissionEarned: number;
  owedToSellers: number;
  owedToRiders: number;
}

export interface SellerItem extends Item {
  isActive?: boolean;
  sellerId?: number;
  sellerName?: string;
}

// ---------- People and access (admin) ----------
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  phone?: string;
  roleId: number | null;
  roleName: string | null;
  active: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  partner?: 'SELLER' | 'RIDER' | null;     // has a marketplace application
  partnerStatus?: string | null;
}

export interface RoleInfo {
  id: number;
  name: string;
  description?: string | null;
  permissions: string[];
  userCount: number;
  builtIn: boolean;   // cannot be deleted or renamed
  locked: boolean;    // ADMIN: always everything
}

export interface PermissionInfo {
  key: string;
  group: string;
  label: string;
  description: string;
  sensitive: boolean; // money or people: shown with a warning
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  target?: string;
  details?: string;
}

// ---------- Cash drawer shifts (POS) ----------
export interface ShiftReport {
  id: number;
  status: 'OPEN' | 'CLOSED';
  cashierEmail: string;
  cashierName?: string;
  openedAt: string;
  closedAt?: string | null;
  closedBy?: string | null;
  openingFloat: number;
  saleCount: number;
  totalSales: number;
  salesByMethod: Record<string, number>;
  cashSales: number;
  otherSales: number;
  cashRefunds: number;
  discounts: number;
  tax: number;
  expectedCash: number;
  countedCash?: number | null;
  difference?: number | null;
  closingNote?: string | null;
  nonCashSales?: NonCashSale[]; // to match against the bank statement
}

export interface NonCashSale {
  orderId: number;
  method: string;
  reference?: string | null;
  amount: number;
  at: string;
}

// ---------- Payment receipt (/api/orders/{id}/receipt) ----------
export interface Receipt {
  orderId: number;
  source: 'ONLINE' | 'POS';
  orderedAt: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  address?: string | null;
  servedBy?: string | null;
  lines: { name: string; quantity: number; unitPrice: number; amount: number }[];
  itemsTotal: number;
  savings?: number | null;
  taxes: { label: string; amount: number }[];
  deliveryFee?: number | null;
  total: number;
  payment: {
    method: string;
    journal?: string | null;
    journalLabel: string;
    account?: string | null;   // "Bank of Bhutan, account ending 4321"
    paidAt?: string | null;
    cashReceived?: number | null;
    change?: number | null;
  };
}

// ---------- Agreements (terms) ----------
export type TermsType = 'SELLER' | 'RIDER' | 'CUSTOMER';

export interface LegalTerms {
  type: TermsType;
  version: number;
  title: string;
  body: string;           // "# " heading, "## " sub-heading, "- " list item, blank line = paragraph
  changeSummary?: string;
  publishedAt: string;
  publishedBy?: string;
  acceptedCount?: number;
}

export interface TermsStatus {
  type: TermsType;
  currentVersion: number;
  acceptedVersion: number | null;
  accepted: boolean;
  acceptedAt?: string | null;
  changeSummary?: string;
}

export interface PartnerDocumentInfo {
  id: number;
  kind: 'ID_CARD' | 'DRIVING_LICENCE' | 'TRADE_LICENCE';
  originalName?: string;
  contentType: string;
  sizeBytes?: number;
  uploadedAt: string;
}

export interface PartnerVerification {
  cidNumber?: string | null;
  tradeLicenseNumber?: string | null;
  tpnNumber?: string | null;
  licenseExpiry?: string | null;
  licenceExpired: boolean;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  termsVersion?: number | null;
  termsAcceptedAt?: string | null;
  documents: PartnerDocumentInfo[];
}

// ---------- Customers ----------
export interface CustomerSummary {
  id: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  hasAccount: boolean;
  visits: number;
  totalSpent: number;
  lastSeenAt?: string | null;
  firstSource?: 'ONLINE' | 'POS' | 'SIGNUP' | null;
  createdAt?: string | null;
}

export interface CustomerOrder {
  orderId: number;
  createdAt: string;
  source: string;
  orderStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  totalAmount: number;
}

export interface CustomerDetail {
  customer: CustomerSummary;
  notes?: string | null;
  orders: CustomerOrder[];
}
