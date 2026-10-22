import { round2 } from "./money";

export type LedgerKind = "opening" | "invoice" | "debit_note" | "payment" | "credit_note";

export type LedgerEntry = {
  date: string;
  kind: LedgerKind;
  ref: string;
  description: string;
  debit: number;
  credit: number;
  link?: string;
};

export type LedgerRow = LedgerEntry & { balance: number };

const KIND_ORDER: Record<LedgerKind, number> = {
  opening: 0,
  invoice: 1,
  debit_note: 2,
  payment: 3,
  credit_note: 4,
};

/**
 * Customer account statement. Debits (invoices, debit notes) increase what the
 * customer owes; credits (payments, credit notes) reduce it. A positive balance
 * is receivable (Dr), a negative one is an advance held for the customer (Cr).
 */
export function buildLedger(openingBalance: number, entries: LedgerEntry[]): LedgerRow[] {
  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.ref.localeCompare(b.ref),
  );
  const rows: LedgerRow[] = [];
  let balance = round2(openingBalance);
  if (openingBalance !== 0) {
    rows.push({
      date: sorted[0]?.date ?? "",
      kind: "opening",
      ref: "",
      description: "Opening balance",
      debit: openingBalance > 0 ? openingBalance : 0,
      credit: openingBalance < 0 ? -openingBalance : 0,
      balance,
    });
  }
  for (const e of sorted) {
    balance = round2(balance + e.debit - e.credit);
    rows.push({ ...e, balance });
  }
  return rows;
}

export function ledgerTotals(rows: LedgerRow[]) {
  return rows.reduce(
    (acc, r) => ({ debit: round2(acc.debit + r.debit), credit: round2(acc.credit + r.credit) }),
    { debit: 0, credit: 0 },
  );
}
