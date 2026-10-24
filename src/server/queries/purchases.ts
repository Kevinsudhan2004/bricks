import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { inboundEntries, materials, purchaseBillItems, purchaseBills, supplierNotes, supplierPayments, suppliers, users } from "@/db/schema";
import { invoiceBalance, paymentStatus, type PaymentStatus } from "@/domain/invoice";
import { buildLedger, type LedgerEntry } from "@/domain/ledger";
import { num, round2 } from "@/domain/money";
import { billCloseBlocker, docState, type DocState } from "@/domain/settlement";
import { requireOwner } from "@/lib/auth";
import { SUPPLIER_NOTE_REASONS } from "@/lib/validators";
import { TAG } from "@/server/tags";

/*
 * The buying side: raw material bills from suppliers, what we paid them and the credit / debit
 * notes they gave us. Owner only. Balance on a bill = total + supplier debit notes − supplier
 * credit notes − payments made (the same formula as a customer order, seen from the other side).
 */

const PURCHASE_TAGS = [TAG.purchases, TAG.inbound, TAG.masters] as const;

export type BillFilter = { supplierId?: number | null; from?: string | null; to?: string | null };

type RawBill = {
  id: number;
  bill_no: string;
  supplier_bill_no: string | null;
  bill_date: string;
  due_date: string | null;
  supplier_id: number;
  supplier_name: string;
  status: "active" | "cancelled";
  closed_at: string | null;
  total: string;
  kg: string;
  materials: string | null;
  material_codes: string | null;
  loads: number;
  paid: string;
  credits: string;
  debits: string;
};

async function loadBillSummaries(filter: BillFilter) {
  "use cache";
  cacheTag(...PURCHASE_TAGS);
  cacheLife("live");
  const conditions = [
    filter.supplierId ? sql`b.supplier_id = ${filter.supplierId}` : undefined,
    filter.from ? sql`b.bill_date >= ${filter.from}` : undefined,
    filter.to ? sql`b.bill_date <= ${filter.to}` : undefined,
  ].filter(Boolean);
  const where = conditions.length ? sql`where ${sql.join(conditions as ReturnType<typeof sql>[], sql` and `)}` : sql``;
  const rows = await db.execute<RawBill>(sql`
    select b.id, b.bill_no, b.supplier_bill_no, b.bill_date::text as bill_date, b.due_date::text as due_date,
           b.supplier_id, s.name as supplier_name, b.status,
           to_char(b.closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as closed_at, b.total,
           coalesce(it.kg, 0) as kg, it.materials, it.material_codes,
           coalesce(ld.loads, 0)::int as loads,
           coalesce(pm.paid, 0) as paid, coalesce(nt.credits, 0) as credits, coalesce(nt.debits, 0) as debits
    from purchase_bills b
    join suppliers s on s.id = b.supplier_id
    left join (
      select pi.bill_id, sum(pi.quantity_kg) as kg,
             string_agg(m.name, ', ' order by m.sort_order) as materials,
             string_agg(m.code, ',' order by m.sort_order) as material_codes
      from purchase_bill_items pi join materials m on m.id = pi.material_id group by pi.bill_id
    ) it on it.bill_id = b.id
    left join (
      select purchase_bill_id, count(*) as loads from inbound_entries
      where deleted_at is null and purchase_bill_id is not null group by purchase_bill_id
    ) ld on ld.purchase_bill_id = b.id
    left join (
      select bill_id, sum(amount) as paid from supplier_payments
      where deleted_at is null and bill_id is not null group by bill_id
    ) pm on pm.bill_id = b.id
    left join (
      select bill_id,
             sum(case when type = 'credit' then amount else 0 end) as credits,
             sum(case when type = 'debit' then amount else 0 end) as debits
      from supplier_notes where deleted_at is null and bill_id is not null group by bill_id
    ) nt on nt.bill_id = b.id
    ${where}
    order by b.bill_date desc, b.id desc
    limit 2000`);
  return [...rows];
}

export type BillSummary = {
  id: number;
  billNo: string;
  supplierBillNo: string | null;
  billDate: string;
  dueDate: string | null;
  supplierId: number;
  supplierName: string;
  cancelled: boolean;
  state: DocState;
  closedAt: string | null;
  /** Ongoing and debit = credit: the owner can close it. */
  readyToClose: boolean;
  total: number;
  paid: number;
  credits: number;
  debits: number;
  /** Still to pay the supplier on this bill. Negative = paid in excess. */
  balance: number;
  paymentStatus: PaymentStatus;
  kg: number;
  materials: string | null;
  materialCodes: string[];
  loads: number;
};

function shapeBill(r: RawBill, today: string): BillSummary {
  const cancelled = r.status === "cancelled";
  const money = { total: num(r.total), paid: num(r.paid), credits: num(r.credits), debits: num(r.debits) };
  const balance = invoiceBalance(money);
  const state = docState({ cancelled, closedAt: r.closed_at });
  return {
    id: r.id,
    billNo: r.bill_no,
    supplierBillNo: r.supplier_bill_no,
    billDate: r.bill_date,
    dueDate: r.due_date,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    cancelled,
    state,
    closedAt: r.closed_at,
    readyToClose: state === "ongoing" && billCloseBlocker({ cancelled, closed: false, balance }) === null,
    ...money,
    balance: cancelled ? 0 : balance,
    paymentStatus: paymentStatus({ ...money, dueDate: r.due_date, today, cancelled }),
    kg: num(r.kg),
    materials: r.materials,
    materialCodes: r.material_codes ? r.material_codes.split(",") : [],
    loads: r.loads,
  };
}

export async function getBillSummaries(filter: BillFilter, today: string) {
  await requireOwner();
  return (await loadBillSummaries(filter)).map((r) => shapeBill(r, today));
}

/** Internal (already-authorized callers like the dashboard). */
export async function billSummariesUnchecked(filter: BillFilter, today: string) {
  return (await loadBillSummaries(filter)).map((r) => shapeBill(r, today));
}

/* ------------------------------------------------------------------ */
/* Bill detail                                                         */
/* ------------------------------------------------------------------ */

async function loadBillDetail(id: number) {
  "use cache";
  cacheTag(...PURCHASE_TAGS, TAG.users);
  cacheLife("live");
  const [row] = await db
    .select({
      bill: purchaseBills,
      supplier: suppliers,
      createdByName: users.name,
      closedByName: sql<string | null>`(select name from users where id = ${purchaseBills.closedBy})`,
    })
    .from(purchaseBills)
    .innerJoin(suppliers, eq(suppliers.id, purchaseBills.supplierId))
    .innerJoin(users, eq(users.id, purchaseBills.createdBy))
    .where(eq(purchaseBills.id, id));
  if (!row) return null;

  const [items, loads, paymentRows, noteRows] = await Promise.all([
    db
      .select({
        id: purchaseBillItems.id,
        materialId: purchaseBillItems.materialId,
        materialName: materials.name,
        materialCode: materials.code,
        quantityKg: purchaseBillItems.quantityKg,
        ratePerTon: purchaseBillItems.ratePerTon,
        gstRate: purchaseBillItems.gstRate,
        amount: purchaseBillItems.amount,
      })
      .from(purchaseBillItems)
      .innerJoin(materials, eq(materials.id, purchaseBillItems.materialId))
      .where(eq(purchaseBillItems.billId, id))
      .orderBy(asc(materials.sortOrder)),
    db
      .select({
        id: inboundEntries.id,
        entryDate: inboundEntries.entryDate,
        materialId: inboundEntries.materialId,
        materialName: materials.name,
        materialCode: materials.code,
        netKg: inboundEntries.netKg,
        vehicleNo: inboundEntries.vehicleNo,
        challanNo: inboundEntries.challanNo,
        amount: inboundEntries.amount,
      })
      .from(inboundEntries)
      .innerJoin(materials, eq(materials.id, inboundEntries.materialId))
      .where(and(eq(inboundEntries.purchaseBillId, id), isNull(inboundEntries.deletedAt)))
      .orderBy(asc(inboundEntries.entryDate), asc(inboundEntries.id)),
    db
      .select()
      .from(supplierPayments)
      .where(and(eq(supplierPayments.billId, id), isNull(supplierPayments.deletedAt)))
      .orderBy(desc(supplierPayments.paymentDate), desc(supplierPayments.id)),
    db
      .select()
      .from(supplierNotes)
      .where(and(eq(supplierNotes.billId, id), isNull(supplierNotes.deletedAt)))
      .orderBy(desc(supplierNotes.noteDate), desc(supplierNotes.id)),
  ]);

  const paid = round2(paymentRows.reduce((a, p) => a + p.amount, 0));
  const credits = round2(noteRows.filter((n) => n.type === "credit").reduce((a, n) => a + n.amount, 0));
  const debits = round2(noteRows.filter((n) => n.type === "debit").reduce((a, n) => a + n.amount, 0));
  return {
    ...row.bill,
    supplier: row.supplier,
    createdByName: row.createdByName,
    closedByName: row.closedByName,
    items,
    loads,
    payments: paymentRows,
    /** The supplier's credit / debit notes on this bill (`notes` is the bill's own remark). */
    adjustments: noteRows,
    paid,
    credits,
    debits,
    balance: invoiceBalance({ total: row.bill.total, paid, credits, debits }),
  };
}

export type BillDetail = NonNullable<Awaited<ReturnType<typeof loadBillDetail>>>;

export async function getBillDetail(id: number) {
  await requireOwner();
  return loadBillDetail(id);
}

/* ------------------------------------------------------------------ */
/* Inputs for the bill form                                            */
/* ------------------------------------------------------------------ */

async function loadUnbilledLoads() {
  "use cache";
  cacheTag(...PURCHASE_TAGS);
  cacheLife("live");
  return db
    .select({
      id: inboundEntries.id,
      entryDate: inboundEntries.entryDate,
      supplierId: inboundEntries.supplierId,
      materialId: inboundEntries.materialId,
      netKg: inboundEntries.netKg,
      vehicleNo: inboundEntries.vehicleNo,
      challanNo: inboundEntries.challanNo,
    })
    .from(inboundEntries)
    .where(and(isNull(inboundEntries.deletedAt), isNull(inboundEntries.purchaseBillId), sql`${inboundEntries.supplierId} is not null`))
    .orderBy(asc(inboundEntries.entryDate), asc(inboundEntries.id))
    .limit(3000);
}

export type BillLoad = Awaited<ReturnType<typeof loadUnbilledLoads>>[number];

/** Loads received but not yet on any supplier bill, grouped by supplier (oldest first). */
export async function getUnbilledLoadsBySupplier() {
  await requireOwner();
  const grouped: Record<number, BillLoad[]> = {};
  for (const l of await loadUnbilledLoads()) (grouped[l.supplierId!] ??= []).push(l);
  return grouped;
}

/** Totals of unbilled loads per supplier (material received, bill not entered yet). */
export async function unbilledTotalsUnchecked() {
  const map = new Map<number, { loads: number; kg: number; oldest: string }>();
  for (const l of await loadUnbilledLoads()) {
    const m = map.get(l.supplierId!) ?? { loads: 0, kg: 0, oldest: l.entryDate };
    m.loads += 1;
    m.kg = round2(m.kg + l.netKg);
    if (l.entryDate < m.oldest) m.oldest = l.entryDate;
    map.set(l.supplierId!, m);
  }
  return map;
}

async function loadLastRates() {
  "use cache";
  cacheTag(TAG.purchases);
  cacheLife("live");
  const rows = await db.execute<{ supplier_id: number; material_id: number; rate_per_ton: string; gst_rate: string }>(sql`
    select distinct on (b.supplier_id, pi.material_id) b.supplier_id, pi.material_id, pi.rate_per_ton, pi.gst_rate
    from purchase_bill_items pi join purchase_bills b on b.id = pi.bill_id
    where b.status = 'active'
    order by b.supplier_id, pi.material_id, b.bill_date desc, b.id desc`);
  return rows.map((r) => ({ supplierId: r.supplier_id, materialId: r.material_id, ratePerTon: num(r.rate_per_ton), gstRate: num(r.gst_rate) }));
}

/** The rate and GST on each supplier's latest bill for each material, to prefill the next bill. */
export async function getLastRates() {
  await requireOwner();
  return loadLastRates();
}

/** Ongoing bills with what's still owed, grouped by supplier — preloaded into the payment / note forms. */
export async function getBillBalancesBySupplier(today: string) {
  await requireOwner();
  const grouped: Record<number, BillBalanceOption[]> = {};
  for (const b of [...(await billSummariesUnchecked({}, today))].reverse()) {
    if (b.state !== "ongoing") continue;
    (grouped[b.supplierId] ??= []).push({
      id: b.id,
      invoiceNo: b.billNo,
      invoiceDate: b.billDate,
      total: b.total,
      balance: b.balance,
      overdue: b.paymentStatus === "overdue",
      sub: b.supplierBillNo ? `Their bill ${b.supplierBillNo}` : undefined,
    });
  }
  return grouped;
}

/** Same shape as an order option so the shared chooser can show it. */
export type BillBalanceOption = {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  total: number;
  balance: number;
  overdue: boolean;
  sub?: string;
};

/* ------------------------------------------------------------------ */
/* Supplier balances & account                                         */
/* ------------------------------------------------------------------ */

async function loadSupplierBalances() {
  "use cache";
  cacheTag(...PURCHASE_TAGS);
  cacheLife("live");
  const rows = await db.execute<{
    id: number;
    opening_balance: string;
    billed: string;
    bill_count: number;
    paid: string;
    credits: string;
    debits: string;
    last_bill: string | null;
    last_activity: string | null;
  }>(sql`
    select s.id, s.opening_balance,
      coalesce(b.billed, 0) as billed, coalesce(b.cnt, 0)::int as bill_count, b.last::text as last_bill,
      coalesce(p.paid, 0) as paid, coalesce(n.credits, 0) as credits, coalesce(n.debits, 0) as debits,
      greatest(b.last, p.last)::text as last_activity
    from suppliers s
    left join (
      select supplier_id, sum(total) as billed, count(*) as cnt, max(bill_date) as last
      from purchase_bills where status = 'active' group by supplier_id
    ) b on b.supplier_id = s.id
    left join (
      select supplier_id, sum(amount) as paid, max(payment_date) as last
      from supplier_payments where deleted_at is null group by supplier_id
    ) p on p.supplier_id = s.id
    left join (
      select supplier_id,
        sum(case when type = 'credit' then amount else 0 end) as credits,
        sum(case when type = 'debit' then amount else 0 end) as debits
      from supplier_notes where deleted_at is null group by supplier_id
    ) n on n.supplier_id = s.id`);
  return rows.map((r) => {
    const opening = num(r.opening_balance);
    const billed = num(r.billed);
    const paid = num(r.paid);
    const credits = num(r.credits);
    const debits = num(r.debits);
    return {
      supplierId: r.id,
      openingBalance: opening,
      billed,
      billCount: r.bill_count,
      paid,
      credits,
      debits,
      lastBill: r.last_bill,
      lastActivity: r.last_activity,
      /** What we still owe this supplier. Negative = advance paid to them. */
      payable: round2(opening + billed + debits - credits - paid),
    };
  });
}

export type SupplierBalance = Awaited<ReturnType<typeof loadSupplierBalances>>[number];

export async function getSupplierBalances() {
  await requireOwner();
  return loadSupplierBalances();
}

export async function supplierBalancesUnchecked() {
  return loadSupplierBalances();
}

async function loadSupplierActivity(supplierId: number) {
  "use cache";
  cacheTag(...PURCHASE_TAGS);
  cacheLife("live");
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
  if (!supplier) return null;
  const [paymentRows, noteRows, billRows, loadRows] = await Promise.all([
    db
      .select({
        id: supplierPayments.id,
        voucherNo: supplierPayments.voucherNo,
        paymentDate: supplierPayments.paymentDate,
        amount: supplierPayments.amount,
        mode: supplierPayments.mode,
        reference: supplierPayments.reference,
        remarks: supplierPayments.remarks,
        billId: supplierPayments.billId,
        billNo: purchaseBills.billNo,
      })
      .from(supplierPayments)
      .leftJoin(purchaseBills, eq(purchaseBills.id, supplierPayments.billId))
      .where(and(eq(supplierPayments.supplierId, supplierId), isNull(supplierPayments.deletedAt)))
      .orderBy(desc(supplierPayments.paymentDate), desc(supplierPayments.id)),
    db
      .select({
        id: supplierNotes.id,
        noteNo: supplierNotes.noteNo,
        type: supplierNotes.type,
        noteDate: supplierNotes.noteDate,
        amount: supplierNotes.amount,
        reason: supplierNotes.reason,
        description: supplierNotes.description,
        billId: supplierNotes.billId,
        billNo: purchaseBills.billNo,
      })
      .from(supplierNotes)
      .leftJoin(purchaseBills, eq(purchaseBills.id, supplierNotes.billId))
      .where(and(eq(supplierNotes.supplierId, supplierId), isNull(supplierNotes.deletedAt)))
      .orderBy(desc(supplierNotes.noteDate), desc(supplierNotes.id)),
    db
      .select({
        id: purchaseBills.id,
        billNo: purchaseBills.billNo,
        supplierBillNo: purchaseBills.supplierBillNo,
        billDate: purchaseBills.billDate,
        total: purchaseBills.total,
      })
      .from(purchaseBills)
      .where(and(eq(purchaseBills.supplierId, supplierId), eq(purchaseBills.status, "active"))),
    db
      .select({
        id: inboundEntries.id,
        entryDate: inboundEntries.entryDate,
        materialName: materials.name,
        materialCode: materials.code,
        netKg: inboundEntries.netKg,
        vehicleNo: inboundEntries.vehicleNo,
        amount: inboundEntries.amount,
        billId: inboundEntries.purchaseBillId,
        billNo: purchaseBills.billNo,
      })
      .from(inboundEntries)
      .innerJoin(materials, eq(materials.id, inboundEntries.materialId))
      .leftJoin(purchaseBills, eq(purchaseBills.id, inboundEntries.purchaseBillId))
      .where(and(eq(inboundEntries.supplierId, supplierId), isNull(inboundEntries.deletedAt)))
      .orderBy(desc(inboundEntries.entryDate), desc(inboundEntries.id))
      .limit(300),
  ]);

  // Our side of the supplier's account: bills and their extra charges raise what we owe,
  // payments and their credit notes reduce it. Positive balance = to pay.
  const entries: LedgerEntry[] = [
    ...billRows.map((b) => ({
      date: b.billDate,
      kind: "invoice" as const,
      ref: b.billNo,
      description: `Raw material bill${b.supplierBillNo ? ` (their no. ${b.supplierBillNo})` : ""}`,
      debit: b.total,
      credit: 0,
      link: `/purchases/${b.id}`,
    })),
    ...noteRows.map((n) => ({
      date: n.noteDate,
      kind: n.type === "debit" ? ("debit_note" as const) : ("credit_note" as const),
      ref: n.noteNo,
      description: `${n.type === "debit" ? "Extra charge" : "Credit from supplier"} – ${SUPPLIER_NOTE_REASONS[n.reason as keyof typeof SUPPLIER_NOTE_REASONS] ?? n.reason}${n.billNo ? ` (${n.billNo})` : ""}`,
      debit: n.type === "debit" ? n.amount : 0,
      credit: n.type === "credit" ? n.amount : 0,
    })),
    ...paymentRows.map((p) => ({
      date: p.paymentDate,
      kind: "payment" as const,
      ref: p.voucherNo,
      description: `Paid (${p.mode.toUpperCase()})${p.billNo ? ` – ${p.billNo}` : " – on account"}`,
      debit: 0,
      credit: p.amount,
    })),
  ];

  return {
    supplier,
    payments: paymentRows,
    notes: noteRows,
    loads: loadRows,
    ledger: buildLedger(supplier.openingBalance, entries),
  };
}

export async function getSupplierAccount(supplierId: number, today: string) {
  await requireOwner();
  const activity = await loadSupplierActivity(supplierId);
  if (!activity) return null;
  const bills = await billSummariesUnchecked({ supplierId }, today);
  return { ...activity, bills };
}

/* ------------------------------------------------------------------ */
/* Payments made & supplier notes (lists)                              */
/* ------------------------------------------------------------------ */

async function loadSupplierPayments(from: string, to: string) {
  "use cache";
  cacheTag(...PURCHASE_TAGS, TAG.users);
  cacheLife("live");
  return db
    .select({
      id: supplierPayments.id,
      voucherNo: supplierPayments.voucherNo,
      paymentDate: supplierPayments.paymentDate,
      supplierId: supplierPayments.supplierId,
      supplierName: suppliers.name,
      billId: supplierPayments.billId,
      billNo: purchaseBills.billNo,
      billClosed: sql<boolean>`${purchaseBills.closedAt} is not null`,
      amount: supplierPayments.amount,
      mode: supplierPayments.mode,
      reference: supplierPayments.reference,
      remarks: supplierPayments.remarks,
      createdByName: users.name,
      createdAt: supplierPayments.createdAt,
    })
    .from(supplierPayments)
    .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplierId))
    .leftJoin(purchaseBills, eq(purchaseBills.id, supplierPayments.billId))
    .innerJoin(users, eq(users.id, supplierPayments.createdBy))
    .where(and(isNull(supplierPayments.deletedAt), gte(supplierPayments.paymentDate, from), lte(supplierPayments.paymentDate, to)))
    .orderBy(desc(supplierPayments.paymentDate), desc(supplierPayments.id))
    .limit(1000);
}

export type SupplierPaymentRow = Awaited<ReturnType<typeof loadSupplierPayments>>[number];

export async function getSupplierPayments(from: string, to: string) {
  await requireOwner();
  return loadSupplierPayments(from, to);
}

async function loadSupplierNotes(from: string, to: string) {
  "use cache";
  cacheTag(...PURCHASE_TAGS, TAG.users);
  cacheLife("live");
  return db
    .select({
      id: supplierNotes.id,
      noteNo: supplierNotes.noteNo,
      type: supplierNotes.type,
      noteDate: supplierNotes.noteDate,
      supplierId: supplierNotes.supplierId,
      supplierName: suppliers.name,
      billId: supplierNotes.billId,
      billNo: purchaseBills.billNo,
      billClosed: sql<boolean>`${purchaseBills.closedAt} is not null`,
      amount: supplierNotes.amount,
      reason: supplierNotes.reason,
      description: supplierNotes.description,
      createdByName: users.name,
    })
    .from(supplierNotes)
    .innerJoin(suppliers, eq(suppliers.id, supplierNotes.supplierId))
    .leftJoin(purchaseBills, eq(purchaseBills.id, supplierNotes.billId))
    .innerJoin(users, eq(users.id, supplierNotes.createdBy))
    .where(and(isNull(supplierNotes.deletedAt), gte(supplierNotes.noteDate, from), lte(supplierNotes.noteDate, to)))
    .orderBy(desc(supplierNotes.noteDate), desc(supplierNotes.id))
    .limit(1000);
}

export type SupplierNoteRow = Awaited<ReturnType<typeof loadSupplierNotes>>[number];

export async function getSupplierNotes(from: string, to: string) {
  await requireOwner();
  return loadSupplierNotes(from, to);
}
