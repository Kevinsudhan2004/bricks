export const DOC_PREFIX = {
  order: "ORD",
  dispatch: "DC",
  receipt: "RC",
  creditNote: "CN",
  debitNote: "DN",
  purchaseBill: "PB",
  supplierPayment: "PV",
  supplierCredit: "PCN",
  supplierDebit: "PDN",
} as const;

export type DocKind = keyof typeof DOC_PREFIX;

/** e.g. formatDocNo("INV", "26-27", 7) → "INV/26-27/0007" */
export function formatDocNo(prefix: string, fy: string, value: number): string {
  return `${prefix}/${fy}/${String(value).padStart(4, "0")}`;
}
