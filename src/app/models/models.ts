// ---------- Auth ----------
export interface LoginResponse {
  email: string;
  name: string;
  phone: string;
  role: string;
}

export interface SignupRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
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
}

// ---------- Cart ----------
export interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  image: string;
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
}

export interface Order {
  orderId: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  address?: string;
  note?: string; // the shop's message to the customer (why info is needed, why a payment was refused)
  totalAmount: number;
  orderStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
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
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string;
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
