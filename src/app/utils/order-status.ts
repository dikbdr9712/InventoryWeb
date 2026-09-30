// One place for how an order or payment status is worded and coloured.
// Every page uses these, so the site never says two different things for one status.

const up = (status?: string) => (status ?? '').trim().toUpperCase();

// How far an order has got: 0 placed, 1 confirmed, 2 shipped, 3 delivered, -1 cancelled
export function orderStage(status?: string): number {
  switch (up(status)) {
    case 'CONFIRMED': return 1;
    case 'SHIPPED': return 2;
    case 'COMPLETED': return 3;
    case 'CANCELLED': return -1;
    default: return 0; // CREATED, PENDING
  }
}

export function orderLabel(status?: string): string {
  switch (up(status)) {
    case 'CREATED': return 'Placed';
    case 'PENDING': return 'Awaiting payment';
    case 'CONFIRMED': return 'Confirmed';
    case 'SHIPPED': return 'On its way';
    case 'COMPLETED': return 'Delivered';
    case 'CANCELLED': return 'Cancelled';
    default: return status ? status : 'Unknown';
  }
}

export function orderPill(status?: string): string {
  switch (orderStage(status)) {
    case -1: return 'pill-bad';
    case 3: return 'pill-ok';
    case 2:
    case 1: return 'pill-info';
    default: return 'pill-wait';
  }
}

export function paymentLabel(status?: string): string {
  switch (up(status)) {
    case 'PAID': return 'Paid';
    case 'PARTIALLY_PAID': return 'Partly paid';
    case 'PENDING': return 'Awaiting payment';
    case 'PENDING_INFO': return 'Info requested';
    case 'REJECTED': return 'Rejected';
    case 'FAILED': return 'Failed';
    default: return status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Unknown';
  }
}

export function paymentPill(status?: string): string {
  switch (up(status)) {
    case 'PAID': return 'pill-ok';
    case 'PARTIALLY_PAID':
    case 'PENDING': return 'pill-wait';
    case 'PENDING_INFO': return 'pill-info';
    case 'REJECTED':
    case 'FAILED': return 'pill-bad';
    default: return 'pill-mute';
  }
}
