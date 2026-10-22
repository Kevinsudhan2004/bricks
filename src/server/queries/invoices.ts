import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import {
  adjustmentNotes,
  customers,
  dispatchItems,
  dispatches,
  invoiceItems,
  invoices,
  payments,
  products,
  users,
} from "@/db/schema";
import {
  deliveryStatus,
  invoiceBalance,
  paymentStatus,
  type DeliveryStatus,
  type PaymentStatus,
} from "@/domain/invoice";
import { num } from "@/domain/money";
import { getCurrentUser, requireOwner } from "@/lib/auth";
import { TAG } from "@/server/tags";

const SALES_TAGS = [TAG.invoices, TAG.dispatch, TAG.payments, TAG.notes, TAG.customers, TAG.masters] as const;

export type InvoiceFilter = {
  customerId?: number | null;
  from?: string | null;
  to?: string | null;
};

type RawInvoiceSummary = {
  id: number;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  customer_id: number;
  customer_name: string;
  firm_name: string | null;
  status: "active" | "cancelled";
  total: string;
  ordered: number;
  delivered: number;
  paid: string;
  credits: string;
  debits: string;
};

/** Every invoice with its ordered/delivered bricks and paid/credit/debit totals, in one query. */
async function loadInvoiceSummaries(filter: InvoiceFilter) {
  "use cache";
  cacheTag(...SALES_TAGS);
  cacheLife("live");
  const conditions = [
    filter.customerId ? sql`i.customer_id = ${filter.customerId}` : undefined,
    filter.from ? sql`i.invoice_date >= ${filter.from}` : undefined,
    filter.to ? sql`i.invoice_date <= ${filter.to}` : undefined,
  ].filter(Boolean);
  const where = conditions.length ? sql`where ${sql.join(conditions as ReturnType<typeof sql>[], sql` and `)}` : sql``;

  const rows = await db.execute<RawInvoiceSummary>(sql`
    select i.id, i.invoice_no, i.invoice_date::text as invoice_date, i.due_date::text as due_date, i.customer_id, c.name as customer_name, c.firm_name,
           i.status, i.total,
           coalesce(it.ordered, 0)::int as ordered,
           coalesce(dl.delivered, 0)::int as delivered,
           coalesce(pm.paid, 0) as paid,
           coalesce(nt.credits, 0) as credits,
           coalesce(nt.debits, 0) as debits
    from invoices i
    join customers c on c.id = i.customer_id
    left join (select invoice_id, sum(quantity) as ordered from invoice_items group by invoice_id) it on it.invoice_id = i.id
    left join (
      select d.invoice_id, sum(di.quantity) as delivered
      from dispatches d join dispatch_items di on di.dispatch_id = d.id
      where d.deleted_at is null group by d.invoice_id
    ) dl on dl.invoice_id = i.id
    left join (
      select invoice_id, sum(amount) as paid from payments
      where deleted_at is null and invoice_id is not null group by invoice_id
    ) pm on pm.invoice_id = i.id
    left join (
      select invoice_id,
             sum(case when type = 'credit' then amount else 0 end) as credits,
             sum(case when type = 'debit' then amount else 0 end) as debits
      from adjustment_notes where deleted_at is null and invoice_id is not null group by invoice_id
    ) nt on nt.invoice_id = i.id
    ${where}
    order by i.invoice_date desc, i.id desc
    limit 2000`);

  const ids = rows.map((r) => r.id);
  const lines = ids.length ? await loadProductProgress(ids) : [];
  return { rows: [...rows], lines };
}

/** Ordered vs delivered per invoice and product (for progress bars). */
async function loadProductProgress(invoiceIds: number[]) {
  const ordered = await db
    .select({
      invoiceId: invoiceItems.invoiceId,
      productId: invoiceItems.productId,
      productName: products.name,
      productCode: products.code,
      ordered: sql<number>`sum(${invoiceItems.quantity})::int`,
    })
    .from(invoiceItems)
    .innerJoin(products, eq(products.id, invoiceItems.productId))
    .where(inArray(invoiceItems.invoiceId, invoiceIds))
    .groupBy(invoiceItems.invoiceId, invoiceItems.productId, products.name, products.code, products.sortOrder)
    .orderBy(asc(products.sortOrder));
  const delivered = await db
    .select({
      invoiceId: dispatches.invoiceId,
      productId: dispatchItems.productId,
      delivered: sql<number>`sum(${dispatchItems.quantity})::int`,
    })
    .from(dispatchItems)
    .innerJoin(dispatches, eq(dispatches.id, dispatchItems.dispatchId))
    .where(and(inArray(dispatches.invoiceId, invoiceIds), isNull(dispatches.deletedAt)))
    .groupBy(dispatches.invoiceId, dispatchItems.productId);
  const key = (i: number, p: number) => `${i}:${p}`;
  const dmap = new Map(delivered.map((d) => [key(d.invoiceId, d.productId), d.delivered]));
  return ordered.map((o) => {
    const del = dmap.get(key(o.invoiceId, o.productId)) ?? 0;
    return { ...o, delivered: del, pending: Math.max(o.ordered - del, 0) };
  });
}

export type InvoiceSummary = {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string | null;
  customerId: number;
  customerName: string;
  firmName: string | null;
  cancelled: boolean;
  total: number;
  ordered: number;
  delivered: number;
  pending: number;
  paid: number;
  credits: number;
  debits: number;
  balance: number;
  deliveryStatus: DeliveryStatus;
  paymentStatus: PaymentStatus;
  products: { productId: number; productName: string; productCode: string; ordered: number; delivered: number; pending: number }[];
};

function shape(
  data: Awaited<ReturnType<typeof loadInvoiceSummaries>>,
  today: string,
): InvoiceSummary[] {
  const byInvoice = new Map<number, InvoiceSummary["products"]>();
  for (const l of data.lines) {
    const list = byInvoice.get(l.invoiceId) ?? [];
    list.push({
      productId: l.productId,
      productName: l.productName,
      productCode: l.productCode,
      ordered: l.ordered,
      delivered: l.delivered,
      pending: l.pending,
    });
    byInvoice.set(l.invoiceId, list);
  }
  return data.rows.map((r) => {
    const cancelled = r.status === "cancelled";
    const money = { total: num(r.total), paid: num(r.paid), credits: num(r.credits), debits: num(r.debits) };
    const prods = byInvoice.get(r.id) ?? [];
    const pending = prods.reduce((a, p) => a + p.pending, 0);
    return {
      id: r.id,
      invoiceNo: r.invoice_no,
      invoiceDate: r.invoice_date,
      dueDate: r.due_date,
      customerId: r.customer_id,
      customerName: r.customer_name,
      firmName: r.firm_name,
      cancelled,
      ...money,
      ordered: r.ordered,
      delivered: r.delivered,
      pending: cancelled ? 0 : pending,
      balance: cancelled ? 0 : invoiceBalance(money),
      deliveryStatus: deliveryStatus(r.ordered, r.delivered, cancelled),
      paymentStatus: paymentStatus({ ...money, dueDate: r.due_date, today, cancelled }),
      products: prods,
    };
  });
}

/** Money removed for employees: they see orders and deliveries, never amounts. */
function withoutMoney(i: InvoiceSummary): InvoiceSummary {
  return { ...i, total: 0, paid: 0, credits: 0, debits: 0, balance: 0, paymentStatus: "unpaid" };
}

export async function getInvoiceSummaries(filter: InvoiceFilter, today: string) {
  const user = await getCurrentUser();
  const rows = shape(await loadInvoiceSummaries(filter), today);
  return user.role === "owner" ? rows : rows.map(withoutMoney);
}

/** Internal (already-authorized callers like dashboards). */
export async function invoiceSummariesUnchecked(filter: InvoiceFilter, today: string) {
  return shape(await loadInvoiceSummaries(filter), today);
}

/* ------------------------------------------------------------------ */
/* Invoice detail                                                      */
/* ------------------------------------------------------------------ */

async function loadInvoiceDetail(id: number) {
  "use cache";
  cacheTag(...SALES_TAGS, TAG.settings);
  cacheLife("live");
  const [invoice] = await db
    .select({
      invoice: invoices,
      customer: customers,
      createdByName: users.name,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .innerJoin(users, eq(users.id, invoices.createdBy))
    .where(eq(invoices.id, id));
  if (!invoice) return null;

  const [items, dispatchRows, paymentRows, noteRows] = await Promise.all([
    db
      .select({
        id: invoiceItems.id,
        productId: invoiceItems.productId,
        productName: products.name,
        productCode: products.code,
        size: products.size,
        hsnCode: products.hsnCode,
        unit: products.unit,
        quantity: invoiceItems.quantity,
        rate: invoiceItems.rate,
        gstRate: invoiceItems.gstRate,
        amount: invoiceItems.amount,
      })
      .from(invoiceItems)
      .innerJoin(products, eq(products.id, invoiceItems.productId))
      .where(eq(invoiceItems.invoiceId, id))
      .orderBy(asc(products.sortOrder)),
    db
      .select({
        id: dispatches.id,
        dispatchNo: dispatches.dispatchNo,
        dispatchDate: dispatches.dispatchDate,
        vehicleNo: dispatches.vehicleNo,
        driverName: dispatches.driverName,
        productId: dispatchItems.productId,
        quantity: dispatchItems.quantity,
      })
      .from(dispatches)
      .innerJoin(dispatchItems, eq(dispatchItems.dispatchId, dispatches.id))
      .where(and(eq(dispatches.invoiceId, id), isNull(dispatches.deletedAt)))
      .orderBy(desc(dispatches.dispatchDate), desc(dispatches.id)),
    db
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, id), isNull(payments.deletedAt)))
      .orderBy(desc(payments.paymentDate)),
    db
      .select()
      .from(adjustmentNotes)
      .where(and(eq(adjustmentNotes.invoiceId, id), isNull(adjustmentNotes.deletedAt)))
      .orderBy(desc(adjustmentNotes.noteDate)),
  ]);

  // Group dispatch rows (one per product line) into challans
  const challans = new Map<
    number,
    { id: number; dispatchNo: string; dispatchDate: string; vehicleNo: string | null; driverName: string | null; items: { productId: number; quantity: number }[] }
  >();
  for (const d of dispatchRows) {
    const c = challans.get(d.id) ?? {
      id: d.id,
      dispatchNo: d.dispatchNo,
      dispatchDate: d.dispatchDate,
      vehicleNo: d.vehicleNo,
      driverName: d.driverName,
      items: [],
    };
    c.items.push({ productId: d.productId, quantity: d.quantity });
    challans.set(d.id, c);
  }

  return {
    ...invoice.invoice,
    customer: invoice.customer,
    createdByName: invoice.createdByName,
    items,
    dispatches: [...challans.values()],
    payments: paymentRows,
    adjustments: noteRows,
  };
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof loadInvoiceDetail>>>;

export async function getInvoiceDetail(id: number) {
  const user = await getCurrentUser();
  const inv = await loadInvoiceDetail(id);
  if (!inv || user.role === "owner") return inv;
  return {
    ...inv,
    subtotal: 0,
    transportCharges: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    roundOff: 0,
    total: 0,
    customer: { ...inv.customer, openingBalance: 0 },
    items: inv.items.map((i) => ({ ...i, rate: 0, amount: 0, gstRate: 0 })),
    payments: [],
    adjustments: [],
  };
}

/* ------------------------------------------------------------------ */
/* Open invoices for the dispatch form (no money — employees use it)   */
/* ------------------------------------------------------------------ */

export async function getOpenInvoicesForCustomer(customerId: number, today: string) {
  await getCurrentUser();
  const all = shape(await loadInvoiceSummaries({ customerId }), today);
  return all
    .filter((i) => !i.cancelled && i.pending > 0)
    .reverse() // oldest first: deliver older orders first
    .map((i) => ({
      id: i.id,
      invoiceNo: i.invoiceNo,
      invoiceDate: i.invoiceDate,
      ordered: i.ordered,
      delivered: i.delivered,
      pending: i.pending,
      products: i.products,
    }));
}

export type OpenInvoice = Awaited<ReturnType<typeof getOpenInvoicesForCustomer>>[number];

/** All undelivered invoices grouped by customer — preloaded into the dispatch form (no money). */
export async function getAllOpenInvoices(today: string, include?: { invoiceId: number; extra: Map<number, number> }) {
  await getCurrentUser();
  const all = shape(await loadInvoiceSummaries({}), today);
  const grouped: Record<number, OpenInvoice[]> = {};
  for (const i of [...all].reverse()) {
    const isEdited = include?.invoiceId === i.id;
    if (i.cancelled || (i.pending <= 0 && !isEdited)) continue;
    // When editing a dispatch, its own quantities count as still pending.
    const products = i.products.map((p) => {
      const extra = isEdited ? (include?.extra.get(p.productId) ?? 0) : 0;
      return { ...p, delivered: p.delivered - extra, pending: p.pending + extra };
    });
    (grouped[i.customerId] ??= []).push({
      id: i.id,
      invoiceNo: i.invoiceNo,
      invoiceDate: i.invoiceDate,
      ordered: i.ordered,
      delivered: products.reduce((a, p) => a + p.delivered, 0),
      pending: products.reduce((a, p) => a + p.pending, 0),
      products,
    });
  }
  return grouped;
}

/** Customers that still have bricks to be delivered (dispatch form shortlist). */
export async function getCustomersWithPending(today: string) {
  await getCurrentUser();
  const all = shape(await loadInvoiceSummaries({}), today);
  const map = new Map<number, { customerId: number; pending: number; invoices: number }>();
  for (const i of all) {
    if (i.cancelled || i.pending <= 0) continue;
    const m = map.get(i.customerId) ?? { customerId: i.customerId, pending: 0, invoices: 0 };
    m.pending += i.pending;
    m.invoices += 1;
    map.set(i.customerId, m);
  }
  return [...map.values()];
}

export async function getInvoicesInRange(from: string, to: string, today: string) {
  await requireOwner();
  return shape(await loadInvoiceSummaries({ from, to }), today);
}

