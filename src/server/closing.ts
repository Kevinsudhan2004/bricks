import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { invoices, purchaseBills } from "@/db/schema";
import { invoiceBalance } from "@/domain/invoice";
import { num } from "@/domain/money";
import { UserError } from "./action-utils";

/*
 * Completed orders and closed supplier bills are frozen: their debit and credit matched when they
 * were closed, so nothing may be added to or removed from them until the owner reopens them.
 * Every write that touches an order's deliveries, payments or notes (or a bill's loads, payments
 * or notes) locks the row first, so a payment saved at the same moment as "close" can't slip in.
 */

/** Lock an order row; throws if it has been completed. */
export async function lockOrderForChange(tx: Tx, invoiceId: number) {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
  if (!inv) throw new UserError("Order not found.");
  if (inv.closedAt) {
    throw new UserError(`Order ${inv.invoiceNo} is completed. Reopen it first to change its deliveries, payments or notes.`);
  }
  return inv;
}

/** Lock a supplier bill row; throws if it has been closed. */
export async function lockBillForChange(tx: Tx, billId: number) {
  const [bill] = await tx.select().from(purchaseBills).where(eq(purchaseBills.id, billId)).for("update");
  if (!bill) throw new UserError("Bill not found.");
  if (bill.closedAt) {
    throw new UserError(`Bill ${bill.billNo} is closed. Reopen it first to change its loads, payments or notes.`);
  }
  return bill;
}

/** Lock an order and read its live position: bricks still to deliver and balance due. */
export async function orderPosition(tx: Tx, invoiceId: number) {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
  if (!inv) return null;
  const [row] = await tx.execute<{ ordered: number; delivered: number; paid: string; credits: string; debits: string }>(sql`
    select
      coalesce((select sum(quantity) from invoice_items where invoice_id = ${invoiceId}), 0)::int as ordered,
      coalesce((select sum(di.quantity) from dispatch_items di join dispatches d on d.id = di.dispatch_id
                where d.invoice_id = ${invoiceId} and d.deleted_at is null), 0)::int as delivered,
      coalesce((select sum(amount) from payments where invoice_id = ${invoiceId} and deleted_at is null), 0) as paid,
      coalesce((select sum(amount) from adjustment_notes where invoice_id = ${invoiceId} and type = 'credit' and deleted_at is null), 0) as credits,
      coalesce((select sum(amount) from adjustment_notes where invoice_id = ${invoiceId} and type = 'debit' and deleted_at is null), 0) as debits`);
  const money = { total: inv.total, paid: num(row.paid), credits: num(row.credits), debits: num(row.debits) };
  return { invoice: inv, pending: Math.max(row.ordered - row.delivered, 0), ...money, balance: invoiceBalance(money) };
}

/** Lock a supplier bill and read what is still owed on it. */
export async function billPosition(tx: Tx, billId: number) {
  const [bill] = await tx.select().from(purchaseBills).where(eq(purchaseBills.id, billId)).for("update");
  if (!bill) return null;
  const [row] = await tx.execute<{ paid: string; credits: string; debits: string }>(sql`
    select
      coalesce((select sum(amount) from supplier_payments where bill_id = ${billId} and deleted_at is null), 0) as paid,
      coalesce((select sum(amount) from supplier_notes where bill_id = ${billId} and type = 'credit' and deleted_at is null), 0) as credits,
      coalesce((select sum(amount) from supplier_notes where bill_id = ${billId} and type = 'debit' and deleted_at is null), 0) as debits`);
  const money = { total: bill.total, paid: num(row.paid), credits: num(row.credits), debits: num(row.debits) };
  return { bill, ...money, balance: invoiceBalance(money) };
}
