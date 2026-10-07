// How a marketplace package's status is worded and coloured, for customers, sellers, riders and staff.
// Same idea as order-status.ts: one place, so every page says the same thing.

import { PackageStatus, PartnerStatus } from '../models/models';

const LABELS: Record<PackageStatus, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  TO_PACK: 'To pack',
  READY_FOR_PICKUP: 'Ready for pickup',
  ASSIGNED: 'Rider on the way to pick up',
  PICKED_UP: 'On the way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled'
};

// The customer's words for the same steps
const CUSTOMER_LABELS: Record<PackageStatus, string> = {
  PENDING_PAYMENT: 'Waiting for payment check',
  TO_PACK: 'Being packed',
  READY_FOR_PICKUP: 'Packed, waiting for a rider',
  ASSIGNED: 'Rider assigned',
  PICKED_UP: 'On the way to you',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled'
};

// "Pick up myself": the customer collects it, so there is no rider
const PICKUP_LABELS: Partial<Record<PackageStatus, string>> = { READY_FOR_PICKUP: 'Waiting for the customer to collect', DELIVERED: 'Collected' };
const PICKUP_CUSTOMER_LABELS: Partial<Record<PackageStatus, string>> = { READY_FOR_PICKUP: 'Ready to collect', DELIVERED: 'Collected' };

export function packageLabel(status: PackageStatus | string | undefined, forCustomer = false, selfPickup = false): string {
  const key = (status ?? '') as PackageStatus;
  if (selfPickup) {
    const own = (forCustomer ? PICKUP_CUSTOMER_LABELS : PICKUP_LABELS)[key];
    if (own) return own;
  }
  return (forCustomer ? CUSTOMER_LABELS[key] : LABELS[key]) ?? status ?? 'Unknown';
}

export function packagePill(status: PackageStatus | string | undefined): string {
  switch (status) {
    case 'DELIVERED': return 'pill-ok';
    case 'CANCELLED': return 'pill-bad';
    case 'PENDING_PAYMENT': return 'pill-mute';
    case 'TO_PACK': return 'pill-wait';
    default: return 'pill-info';
  }
}

// 0 paid/packing, 1 ready, 2 picked up, 3 delivered; -1 cancelled or not paid yet
export function packageStage(status: PackageStatus | string | undefined): number {
  switch (status) {
    case 'TO_PACK': return 0;
    case 'READY_FOR_PICKUP':
    case 'ASSIGNED': return 1;
    case 'PICKED_UP': return 2;
    case 'DELIVERED': return 3;
    default: return -1;
  }
}

export function partnerLabel(status: PartnerStatus | string | undefined): string {
  switch (status) {
    case 'PENDING': return 'Waiting for review';
    case 'APPROVED': return 'Active';
    case 'REJECTED': return 'Not approved';
    case 'SUSPENDED': return 'Suspended';
    default: return status ?? '';
  }
}

export function partnerPill(status: PartnerStatus | string | undefined): string {
  switch (status) {
    case 'APPROVED': return 'pill-ok';
    case 'PENDING': return 'pill-wait';
    case 'REJECTED':
    case 'SUSPENDED': return 'pill-bad';
    default: return 'pill-mute';
  }
}

// "Open in Google Maps" for a typed address (Bhutan addresses are free text)
export function mapLink(address?: string | null): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((address ?? '') + ', Bhutan');
}
