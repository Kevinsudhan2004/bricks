import { round2 } from "./money";

/**
 * Lifecycle shared by customer orders and supplier bills.
 * - ongoing: still being delivered and/or paid
 * - closed: the owner closed it once debit and credit matched (orders call this "completed")
 * - cancelled: removed from all balances
 */
export type DocState = "ongoing" | "closed" | "cancelled";

export function docState(x: { cancelled: boolean; closedAt: Date | string | null }): DocState {
  if (x.cancelled) return "cancelled";
  return x.closedAt ? "closed" : "ongoing";
}

/** Debit and credit match once the balance is zero to the paisa. */
export function isSettled(balance: number): boolean {
  return Math.abs(round2(balance)) < 0.01;
}

const rupees = (v: number) => `₹${Math.abs(round2(v)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Why a customer order can't be marked completed yet, or null when it can.
 * Completed means every brick is delivered and order total + debit notes = payments + credit notes.
 */
export function orderCloseBlocker(x: { cancelled: boolean; closed: boolean; pending: number; balance: number }): string | null {
  if (x.cancelled) return "This order was cancelled.";
  if (x.closed) return "This order is already completed.";
  if (x.pending > 0) {
    return `${x.pending.toLocaleString("en-IN")} bricks are still to be delivered. Deliver them, or edit the order down to what was delivered.`;
  }
  if (isSettled(x.balance)) return null;
  if (x.balance > 0) return `${rupees(x.balance)} is still due from the customer. Debit and credit must match before the order is completed.`;
  return `${rupees(x.balance)} more was received than billed. Correct the payment or add a debit note so debit and credit match.`;
}

/**
 * Why a supplier bill can't be closed yet, or null when it can.
 * Closed means bill total + supplier's extra charges = payments made + supplier's credit notes.
 */
export function billCloseBlocker(x: { cancelled: boolean; closed: boolean; balance: number }): string | null {
  if (x.cancelled) return "This bill was cancelled.";
  if (x.closed) return "This bill is already closed.";
  if (isSettled(x.balance)) return null;
  if (x.balance > 0) return `${rupees(x.balance)} is still to be paid to the supplier. Debit and credit must match before the bill is closed.`;
  return `${rupees(x.balance)} more was paid than billed. Correct the payment or record the supplier's extra charge so debit and credit match.`;
}
