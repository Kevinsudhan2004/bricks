import { round2, sum } from "./money";

export type InvoiceLineInput = { productId: number; quantity: number; rate: number; gstRate: number };
export type TaxType = "intra" | "inter";

export type InvoiceTotals = {
  lines: (InvoiceLineInput & { amount: number; tax: number })[];
  subtotal: number;
  transportCharges: number;
  transportTax: number;
  taxTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
};

/**
 * GST invoice maths.
 * - Each line's taxable value = qty × rate, taxed at the line's GST rate.
 * - Transport is part of a composite supply, so it is taxed at the rate of the
 *   principal supply (the line with the highest taxable value).
 * - Intra-state tax is split equally into CGST + SGST; inter-state is IGST.
 * - The grand total is rounded to the nearest rupee and the difference shown as round-off.
 */
export function computeInvoiceTotals(input: {
  items: InvoiceLineInput[];
  transportCharges?: number;
  taxType: TaxType;
}): InvoiceTotals {
  const lines = input.items.map((item) => {
    const amount = round2(item.quantity * item.rate);
    const tax = round2((amount * item.gstRate) / 100);
    return { ...item, amount, tax };
  });

  const subtotal = sum(lines.map((l) => l.amount));
  const transportCharges = round2(input.transportCharges ?? 0);
  const principal = lines.reduce<(typeof lines)[number] | null>(
    (best, l) => (best === null || l.amount > best.amount ? l : best),
    null,
  );
  const transportTax = round2((transportCharges * (principal?.gstRate ?? 0)) / 100);
  const taxTotal = round2(sum(lines.map((l) => l.tax)) + transportTax);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (input.taxType === "inter") {
    igst = taxTotal;
  } else {
    cgst = round2(taxTotal / 2);
    sgst = round2(taxTotal - cgst);
  }

  const gross = round2(subtotal + transportCharges + taxTotal);
  const total = Math.round(gross);
  const roundOff = round2(total - gross);

  return { lines, subtotal, transportCharges, transportTax, taxTotal, cgst, sgst, igst, roundOff, total };
}

/* ------------------------------------------------------------------ */
/* Delivery progress                                                   */
/* ------------------------------------------------------------------ */

export type DeliveryStatus = "not_started" | "partial" | "completed" | "cancelled";

export type ProductProgress = { productId: number; ordered: number; delivered: number; pending: number };

export function deliveryProgress(
  ordered: { productId: number; quantity: number }[],
  delivered: { productId: number; quantity: number }[],
): { byProduct: ProductProgress[]; ordered: number; delivered: number; pending: number } {
  const orderedMap = new Map<number, number>();
  for (const o of ordered) orderedMap.set(o.productId, (orderedMap.get(o.productId) ?? 0) + o.quantity);
  const deliveredMap = new Map<number, number>();
  for (const d of delivered) deliveredMap.set(d.productId, (deliveredMap.get(d.productId) ?? 0) + d.quantity);

  const byProduct: ProductProgress[] = [...orderedMap.entries()].map(([productId, qty]) => {
    const del = deliveredMap.get(productId) ?? 0;
    return { productId, ordered: qty, delivered: del, pending: Math.max(qty - del, 0) };
  });
  const totals = byProduct.reduce(
    (acc, p) => ({
      ordered: acc.ordered + p.ordered,
      delivered: acc.delivered + p.delivered,
      pending: acc.pending + p.pending,
    }),
    { ordered: 0, delivered: 0, pending: 0 },
  );
  return { byProduct, ...totals };
}

export function deliveryStatus(ordered: number, delivered: number, cancelled = false): DeliveryStatus {
  if (cancelled) return "cancelled";
  if (delivered <= 0) return "not_started";
  if (delivered >= ordered) return "completed";
  return "partial";
}

/* ------------------------------------------------------------------ */
/* Payment status                                                      */
/* ------------------------------------------------------------------ */

export type PaymentStatus = "unpaid" | "partial" | "paid" | "overdue" | "cancelled";

/** Amount still owed on an invoice: total + debit notes − credit notes − payments. */
export function invoiceBalance(x: { total: number; paid: number; credits: number; debits: number }): number {
  return round2(x.total + x.debits - x.credits - x.paid);
}

export function paymentStatus(x: {
  total: number;
  paid: number;
  credits: number;
  debits: number;
  dueDate: string | null;
  today: string;
  cancelled?: boolean;
}): PaymentStatus {
  if (x.cancelled) return "cancelled";
  const balance = invoiceBalance(x);
  if (balance <= 0) return "paid";
  if (x.dueDate && x.today > x.dueDate) return "overdue";
  if (x.paid + x.credits > 0) return "partial";
  return "unpaid";
}
