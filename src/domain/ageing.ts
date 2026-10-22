import { daysBetween } from "./dates";
import { round2 } from "./money";

export const AGEING_BUCKETS = ["0–30 days", "31–60 days", "61–90 days", "90+ days"] as const;

/** Group outstanding invoice balances by how long they've been open (days since invoice date). */
export function ageingBuckets(invoices: { invoiceDate: string; balance: number }[], today: string) {
  const totals = [0, 0, 0, 0];
  for (const inv of invoices) {
    if (inv.balance <= 0) continue;
    const age = daysBetween(inv.invoiceDate, today);
    const idx = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3;
    totals[idx] += inv.balance;
  }
  return AGEING_BUCKETS.map((label, i) => ({ bucket: label, amount: round2(totals[i]) }));
}
