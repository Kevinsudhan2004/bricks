import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { adjustmentNotes, customers, dispatchItems, dispatches, invoices, payments, products } from "@/db/schema";
import { buildLedger, type LedgerEntry } from "@/domain/ledger";
import { num, round2 } from "@/domain/money";
import { getCurrentUser, requireOwner } from "@/lib/auth";
import { NOTE_REASONS } from "@/lib/validators";
import { TAG } from "@/server/tags";
import { invoiceSummariesUnchecked } from "./invoices";

const SALES_TAGS = [TAG.invoices, TAG.dispatch, TAG.payments, TAG.notes, TAG.customers] as const;

type RawBalance = {
  id: number;
  name: string;
  firm_name: string | null;
  phone: string | null;
  state_name: string | null;
  active: boolean;
  opening_balance: string;
  billed: string;
  invoice_count: number;
  paid: string;
  credits: string;
  debits: string;
  ordered: number;
  delivered: number;
  last_activity: string | null;
};

async function loadCustomerBalances() {
  "use cache";
  cacheTag(...SALES_TAGS);
  cacheLife("live");
  const rows = await db.execute<RawBalance>(sql`
    select c.id, c.name, c.firm_name, c.phone, c.state_name, c.active, c.opening_balance,
      coalesce(inv.billed, 0) as billed, coalesce(inv.cnt, 0)::int as invoice_count,
      coalesce(p.paid, 0) as paid, coalesce(n.credits, 0) as credits, coalesce(n.debits, 0) as debits,
      coalesce(o.ordered, 0)::int as ordered, coalesce(d.delivered, 0)::int as delivered,
      greatest(inv.last, p.last, d.last)::text as last_activity
    from customers c
    left join (
      select customer_id, sum(total) as billed, count(*) as cnt, max(invoice_date) as last
      from invoices where status = 'active' group by customer_id
    ) inv on inv.customer_id = c.id
    left join (
      select customer_id, sum(amount) as paid, max(payment_date) as last
      from payments where deleted_at is null group by customer_id
    ) p on p.customer_id = c.id
    left join (
      select customer_id,
        sum(case when type = 'credit' then amount else 0 end) as credits,
        sum(case when type = 'debit' then amount else 0 end) as debits
      from adjustment_notes where deleted_at is null group by customer_id
    ) n on n.customer_id = c.id
    left join (
      select i.customer_id, sum(ii.quantity) as ordered
      from invoice_items ii join invoices i on i.id = ii.invoice_id
      where i.status = 'active' group by i.customer_id
    ) o on o.customer_id = c.id
    left join (
      select d.customer_id, sum(di.quantity) as delivered, max(d.dispatch_date) as last
      from dispatch_items di join dispatches d on d.id = di.dispatch_id join invoices i on i.id = d.invoice_id
      where d.deleted_at is null and i.status = 'active' group by d.customer_id
    ) d on d.customer_id = c.id
    order by c.name`);
  return rows.map((r) => {
    const opening = num(r.opening_balance);
    const billed = num(r.billed);
    const paid = num(r.paid);
    const credits = num(r.credits);
    const debits = num(r.debits);
    return {
      id: r.id,
      name: r.name,
      firmName: r.firm_name,
      phone: r.phone,
      stateName: r.state_name,
      active: r.active,
      openingBalance: opening,
      billed,
      invoiceCount: r.invoice_count,
      paid,
      credits,
      debits,
      outstanding: round2(opening + billed + debits - credits - paid),
      ordered: r.ordered,
      delivered: r.delivered,
      pending: Math.max(r.ordered - r.delivered, 0),
      lastActivity: r.last_activity,
    };
  });
}

export type CustomerBalance = Awaited<ReturnType<typeof loadCustomerBalances>>[number];

export async function getCustomerBalances() {
  await requireOwner();
  return loadCustomerBalances();
}

export async function customerBalancesUnchecked() {
  return loadCustomerBalances();
}

/* ------------------------------------------------------------------ */
/* Customer dashboard                                                  */
/* ------------------------------------------------------------------ */

async function loadCustomerActivity(customerId: number) {
  "use cache";
  cacheTag(...SALES_TAGS, TAG.masters);
  cacheLife("live");
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) return null;

  const [dispatchRows, paymentRows, noteRows, invoiceRows, monthly] = await Promise.all([
    db
      .select({
        id: dispatches.id,
        dispatchNo: dispatches.dispatchNo,
        dispatchDate: dispatches.dispatchDate,
        invoiceId: dispatches.invoiceId,
        invoiceNo: invoices.invoiceNo,
        vehicleNo: dispatches.vehicleNo,
        driverName: dispatches.driverName,
        items: sql<{ productId: number; name: string; code: string; quantity: number }[]>`(
          select json_agg(json_build_object('productId', di.product_id, 'name', p.name, 'code', p.code, 'quantity', di.quantity) order by p.sort_order)
          from dispatch_items di join products p on p.id = di.product_id where di.dispatch_id = ${dispatches.id})`,
      })
      .from(dispatches)
      .innerJoin(invoices, eq(invoices.id, dispatches.invoiceId))
      .where(and(eq(dispatches.customerId, customerId), isNull(dispatches.deletedAt)))
      .orderBy(desc(dispatches.dispatchDate), desc(dispatches.id))
      .limit(300),
    db
      .select({
        id: payments.id,
        receiptNo: payments.receiptNo,
        paymentDate: payments.paymentDate,
        amount: payments.amount,
        mode: payments.mode,
        reference: payments.reference,
        remarks: payments.remarks,
        invoiceId: payments.invoiceId,
        invoiceNo: invoices.invoiceNo,
      })
      .from(payments)
      .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.customerId, customerId), isNull(payments.deletedAt)))
      .orderBy(desc(payments.paymentDate), desc(payments.id)),
    db
      .select({
        id: adjustmentNotes.id,
        noteNo: adjustmentNotes.noteNo,
        type: adjustmentNotes.type,
        noteDate: adjustmentNotes.noteDate,
        amount: adjustmentNotes.amount,
        reason: adjustmentNotes.reason,
        description: adjustmentNotes.description,
        invoiceId: adjustmentNotes.invoiceId,
        invoiceNo: invoices.invoiceNo,
      })
      .from(adjustmentNotes)
      .leftJoin(invoices, eq(invoices.id, adjustmentNotes.invoiceId))
      .where(and(eq(adjustmentNotes.customerId, customerId), isNull(adjustmentNotes.deletedAt)))
      .orderBy(desc(adjustmentNotes.noteDate), desc(adjustmentNotes.id)),
    db
      .select({ id: invoices.id, invoiceNo: invoices.invoiceNo, invoiceDate: invoices.invoiceDate, total: invoices.total })
      .from(invoices)
      .where(and(eq(invoices.customerId, customerId), eq(invoices.status, "active"))),
    db
      .select({
        month: sql<string>`to_char(${dispatches.dispatchDate}, 'YYYY-MM')`,
        productId: dispatchItems.productId,
        code: products.code,
        quantity: sql<number>`sum(${dispatchItems.quantity})::int`,
      })
      .from(dispatchItems)
      .innerJoin(dispatches, eq(dispatches.id, dispatchItems.dispatchId))
      .innerJoin(products, eq(products.id, dispatchItems.productId))
      .where(and(eq(dispatches.customerId, customerId), isNull(dispatches.deletedAt)))
      .groupBy(sql`1`, dispatchItems.productId, products.code),
  ]);

  const ledgerEntries: LedgerEntry[] = [
    ...invoiceRows.map((i) => ({
      date: i.invoiceDate,
      kind: "invoice" as const,
      ref: i.invoiceNo,
      description: "Order (billed)",
      debit: i.total,
      credit: 0,
      link: `/orders/${i.id}`,
    })),
    ...noteRows.map((n) => ({
      date: n.noteDate,
      kind: n.type === "debit" ? ("debit_note" as const) : ("credit_note" as const),
      ref: n.noteNo,
      description: `${n.type === "debit" ? "Debit" : "Credit"} note – ${NOTE_REASONS[n.reason as keyof typeof NOTE_REASONS] ?? n.reason}${n.invoiceNo ? ` (${n.invoiceNo})` : ""}`,
      debit: n.type === "debit" ? n.amount : 0,
      credit: n.type === "credit" ? n.amount : 0,
    })),
    ...paymentRows.map((p) => ({
      date: p.paymentDate,
      kind: "payment" as const,
      ref: p.receiptNo,
      description: `Payment received (${p.mode.toUpperCase()})${p.invoiceNo ? ` – ${p.invoiceNo}` : " – on account"}`,
      debit: 0,
      credit: p.amount,
    })),
  ];

  return {
    customer,
    dispatches: dispatchRows,
    payments: paymentRows,
    notes: noteRows,
    ledger: buildLedger(customer.openingBalance, ledgerEntries),
    monthly,
  };
}

export async function getCustomerDashboard(customerId: number, today: string) {
  await requireOwner();
  const activity = await loadCustomerActivity(customerId);
  if (!activity) return null;
  const invoiceList = await invoiceSummariesUnchecked({ customerId }, today);
  return { ...activity, invoices: invoiceList };
}

async function loadCustomer(id: number) {
  "use cache";
  cacheTag(TAG.customers);
  cacheLife("live");
  const [row] = await db.select().from(customers).where(eq(customers.id, id));
  return row ?? null;
}

export async function getCustomer(id: number) {
  await requireOwner();
  return loadCustomer(id);
}

/* ------------------------------------------------------------------ */
/* Directory (contact details only — safe for employees)               */
/* ------------------------------------------------------------------ */

async function loadDirectory() {
  "use cache";
  cacheTag(TAG.customers);
  cacheLife("max");
  return db
    .select({
      id: customers.id,
      name: customers.name,
      firmName: customers.firmName,
      phone: customers.phone,
      altPhone: customers.altPhone,
      gstin: customers.gstin,
      billingAddress: customers.billingAddress,
      siteAddress: customers.siteAddress,
      stateName: customers.stateName,
      active: customers.active,
    })
    .from(customers)
    .orderBy(customers.name);
}

export type CustomerContact = Awaited<ReturnType<typeof loadDirectory>>[number];

export async function getCustomerDirectory() {
  await getCurrentUser();
  return (await loadDirectory()).filter((c) => c.active);
}
