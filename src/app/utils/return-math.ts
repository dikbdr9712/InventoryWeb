// The arithmetic of a return, kept apart from the screen so it is easy to read and to test.
// Money is added up in whole cents, so Nu. 12,993.75 + Nu. 27,027.00 can never turn into 40020.749999.

export interface ReturnLine {
  orderItemId: number;
  unitRefund: number;   // what the customer really paid for ONE, tax included
  quantityLeft: number; // how many can still be returned
}

const cents = (amount: number) => Math.round(amount * 100);

// A quantity the person asks for is never below 0 and never above what is left
export function clampQuantity(value: number, left: number): number {
  const wanted = Math.trunc(Number(value)) || 0;
  return Math.max(0, Math.min(wanted, Math.max(0, left)));
}

export function lineRefund(unitRefund: number, quantity: number): number {
  return (cents(unitRefund) * quantity) / 100;
}

export function refundTotal(lines: ReturnLine[], quantities: Record<number, number>): number {
  let sumInCents = 0;
  for (const line of lines) {
    sumInCents += cents(line.unitRefund) * clampQuantity(quantities[line.orderItemId] ?? 0, line.quantityLeft);
  }
  return sumInCents / 100;
}

export function itemCount(lines: ReturnLine[], quantities: Record<number, number>): number {
  let count = 0;
  for (const line of lines) {
    count += clampQuantity(quantities[line.orderItemId] ?? 0, line.quantityLeft);
  }
  return count;
}

// The lines to send to the server: only the ones with something to return
export function itemsToSend(lines: ReturnLine[], quantities: Record<number, number>, restock: Record<number, boolean>) {
  return lines
    .map(line => ({
      orderItemId: line.orderItemId,
      quantity: clampQuantity(quantities[line.orderItemId] ?? 0, line.quantityLeft),
      restock: restock[line.orderItemId] ?? true
    }))
    .filter(item => item.quantity > 0);
}
