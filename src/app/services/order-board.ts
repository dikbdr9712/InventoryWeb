import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

// The order board: every online order by step, who has it, what is late, and the team.
// COLLECT: packed, the customer comes to collect it ("Pick up myself")
export type BoardStage = 'PAYMENT_DUE' | 'VERIFY' | 'PACK' | 'READY' | 'COLLECT' | 'ASSIGNED' | 'ON_THE_WAY' | 'DELIVERED' | 'CANCELLED';
export type DeliverySizeName = 'SMALL' | 'MEDIUM' | 'LARGE' | 'BULKY';

export interface BoardItem {
  key: string;                 // o12 (order) or p34 (package)
  stage: BoardStage;
  orderId: number;
  packageId: number | null;    // packing and delivery steps are per package
  packageNo: number;
  packageCount: number;
  legacy: boolean;             // an order from before packages: Ship / Mark delivered
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  dropAddress?: string;
  sellerId?: number | null;    // empty = our own shop
  sellerName?: string | null;
  sellerPhone?: string | null;
  pickupAddress?: string | null;
  lines: { name: string; quantity: number; unitPrice: number }[];
  itemCount: number;
  amount: number;
  orderTotal: number;
  paymentStatus?: string;
  paymentMethod?: string | null;
  journal?: string | null;
  paymentNote?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  packerEmail?: string | null;
  packerName?: string | null;
  packingStartedAt?: string | null;
  riderId?: number | null;
  riderName?: string | null;
  riderPhone?: string | null;
  riderVehicle?: string | null;
  riderAssignedByName?: string | null;
  courierName?: string | null;
  deliverySize?: DeliverySizeName | null;
  distanceKm?: number | null;
  placedAt?: string | null;
  stageSince?: string | null;
  minutesInStage: number;
  targetMinutes?: number | null;
  late: boolean;
  packedAt?: string | null;
  assignedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  deliveryFee?: number | null;  // what the customer paid for delivering this package
  riderPay?: number | null;     // what the driver earns for it
  pickupTown?: string | null;   // the seller's town (empty for our own shop)
  older: boolean;               // placed before the chosen period, still open
  selfPickup: boolean;          // "Pick up myself": the customer collects it, no driver
  handedOverByName?: string | null; // who gave it to the customer
}

export interface BoardCounts {
  awaitingPayment: number;
  verify: number;
  toPack: number;
  toPackNotStarted: number;
  ready: number;
  riderComing: number;
  onTheWay: number;
  delivered: number;    // in the period
  cancelled: number;    // in the period
  late: number;
  needsAction: number;
  placed: number;       // orders placed in the period
  olderOpen: number;    // placed before the period and still not delivered
  toCollect: number;    // packed, waiting for the customer to collect
}

export interface BoardPacker { email: string; name: string; role: string; packing: number; packed: number; }

export interface BoardRider {
  id: number; name: string; phone?: string; vehicleType: string; vehicle: string; carries: DeliverySizeName;
  active: number; max: number; delivered: number; available: boolean;
}

export interface OrderBoard {
  generatedAt: string;
  from: string;           // the period, yyyy-mm-dd, both days included
  to: string;
  includeOlder: boolean;
  targets: { verifyMinutes: number; packMinutes: number; pickupMinutes: number; deliverMinutes: number; unpaidMinutes: number };
  counts: BoardCounts;
  items: BoardItem[];
  packers: BoardPacker[];
  riders: BoardRider[];
  me: string;
  canAssign: boolean;
}

@Injectable({ providedIn: 'root' })
export class OrderBoardService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/admin/order-board`;
  private pkgApi = `${environment.apiUrl}/api/marketplace/packages`;
  private orderApi = `${environment.apiUrl}/api/orders`;

  // Orders placed from..to (yyyy-mm-dd, both included); older = also earlier orders that are still open
  board(from: string, to: string, older: boolean) {
    return this.http.get<OrderBoard>(this.api, { params: { from, to, older } });
  }

  // ---- packing ----
  take(packageId: number) {
    return this.http.post(`${this.api}/packages/${packageId}/take`, null);
  }

  release(packageId: number) {
    return this.http.post(`${this.api}/packages/${packageId}/release`, null);
  }

  assignPacker(packageId: number, email: string) {
    return this.http.post(`${this.api}/packages/${packageId}/packer`, { email });
  }

  packed(packageId: number) {
    return this.http.post(`${this.pkgApi}/${packageId}/packed`, null);
  }

  // "Pick up myself": the customer has it. The code may be empty (staff checked who it is).
  handOver(packageId: number, code: string | null) {
    return this.http.post(`${this.api}/packages/${packageId}/handover`, { code });
  }

  // ---- delivery ----
  assignRider(packageId: number, riderId: number) {
    return this.http.post(`${this.api}/packages/${packageId}/rider`, { riderId });
  }

  removeRider(packageId: number) {
    return this.http.post(`${this.api}/packages/${packageId}/rider/remove`, null);
  }

  // staff take it themselves (no driver), or confirm a driver collected it
  pickUp(packageId: number) {
    return this.http.post(`${this.pkgApi}/${packageId}/pickup`, null);
  }

  delivered(packageId: number) {
    return this.http.post(`${this.pkgApi}/${packageId}/deliver`, null);
  }

  // ---- whole orders (payment, cancel, and orders from before packages) ----
  orderAction(orderId: number, action: 'confirm-payment' | 'ship' | 'cancel' | 'complete') {
    const url = action === 'cancel' || action === 'complete'
      ? `${environment.apiUrl}/api/admin/orders/${orderId}/${action}`
      : `${this.orderApi}/${orderId}/${action}`;
    return this.http.post(url, {}, { responseType: 'text' });
  }
}
