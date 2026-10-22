import "server-only";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { adjustmentNotes, customers, invoices, payments, users } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { TAG } from "@/server/tags";
import { invoiceSummariesUnchecked } from "./invoices";

async function loadPayments(from: string, to: string) {
  "use cache";
  cacheTag(TAG.payments, TAG.customers, TAG.invoices);
  cacheLife("live");
  return db
    .select({
      id: payments.id,
      receiptNo: payments.receiptNo,
      paymentDate: payments.paymentDate,
      customerId: payments.customerId,
      customerName: customers.name,
      firmName: customers.firmName,
      invoiceId: payments.invoiceId,
      invoiceNo: invoices.invoiceNo,
      amount: payments.amount,
      mode: payments.mode,
      reference: payments.reference,
      remarks: payments.remarks,
      createdByName: users.name,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(users, eq(users.id, payments.createdBy))
    .where(and(isNull(payments.deletedAt), gte(payments.paymentDate, from), lte(payments.paymentDate, to)))
    .orderBy(desc(payments.paymentDate), desc(payments.id))
    .limit(1000);
}

export type PaymentRow = Awaited<ReturnType<typeof loadPayments>>[number];

export async function getPayments(from: string, to: string) {
  await requireOwner();
  return loadPayments(from, to);
}

async function loadNotes(from: string, to: string) {
  "use cache";
  cacheTag(TAG.notes, TAG.customers, TAG.invoices);
  cacheLife("live");
  return db
    .select({
      id: adjustmentNotes.id,
      noteNo: adjustmentNotes.noteNo,
      type: adjustmentNotes.type,
      noteDate: adjustmentNotes.noteDate,
      customerId: adjustmentNotes.customerId,
      customerName: customers.name,
      firmName: customers.firmName,
      invoiceId: adjustmentNotes.invoiceId,
      invoiceNo: invoices.invoiceNo,
      amount: adjustmentNotes.amount,
      reason: adjustmentNotes.reason,
      description: adjustmentNotes.description,
      createdByName: users.name,
    })
    .from(adjustmentNotes)
    .innerJoin(customers, eq(customers.id, adjustmentNotes.customerId))
    .leftJoin(invoices, eq(invoices.id, adjustmentNotes.invoiceId))
    .innerJoin(users, eq(users.id, adjustmentNotes.createdBy))
    .where(and(isNull(adjustmentNotes.deletedAt), gte(adjustmentNotes.noteDate, from), lte(adjustmentNotes.noteDate, to)))
    .orderBy(desc(adjustmentNotes.noteDate), desc(adjustmentNotes.id))
    .limit(1000);
}

export async function getNotes(from: string, to: string) {
  await requireOwner();
  return loadNotes(from, to);
}

/** Every active invoice with its balance, grouped by customer — preloaded into payment/note forms. */
export async function getInvoiceBalancesByCustomer(today: string) {
  await requireOwner();
  const all = await invoiceSummariesUnchecked({}, today);
  const grouped: Record<number, { id: number; invoiceNo: string; invoiceDate: string; total: number; balance: number; overdue: boolean }[]> = {};
  for (const i of [...all].reverse()) {
    if (i.cancelled) continue;
    (grouped[i.customerId] ??= []).push({
      id: i.id,
      invoiceNo: i.invoiceNo,
      invoiceDate: i.invoiceDate,
      total: i.total,
      balance: i.balance,
      overdue: i.paymentStatus === "overdue",
    });
  }
  return grouped;
}

export type InvoiceBalanceOption = Awaited<ReturnType<typeof getInvoiceBalancesByCustomer>>[number][number];

async function loadPayment(id: number) {
  "use cache";
  cacheTag(TAG.payments, TAG.customers, TAG.invoices);
  cacheLife("live");
  const [row] = await db
    .select({ payment: payments, customer: customers, invoiceNo: invoices.invoiceNo, createdByName: users.name })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(users, eq(users.id, payments.createdBy))
    .where(and(eq(payments.id, id), isNull(payments.deletedAt)));
  return row ?? null;
}

export async function getPayment(id: number) {
  await requireOwner();
  return loadPayment(id);
}

async function loadNote(id: number) {
  "use cache";
  cacheTag(TAG.notes, TAG.customers, TAG.invoices);
  cacheLife("live");
  const [row] = await db
    .select({ note: adjustmentNotes, customer: customers, invoiceNo: invoices.invoiceNo })
    .from(adjustmentNotes)
    .innerJoin(customers, eq(customers.id, adjustmentNotes.customerId))
    .leftJoin(invoices, eq(invoices.id, adjustmentNotes.invoiceId))
    .where(and(eq(adjustmentNotes.id, id), isNull(adjustmentNotes.deletedAt)));
  return row ?? null;
}

export async function getNote(id: number) {
  await requireOwner();
  return loadNote(id);
}
