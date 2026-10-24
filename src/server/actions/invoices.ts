"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { adjustmentNotes, companySettings, customers, dispatchItems, dispatches, invoiceItems, invoices, payments, products } from "@/db/schema";
import { addDays } from "@/domain/dates";
import { computeInvoiceTotals } from "@/domain/invoice";
import { orderCloseBlocker } from "@/domain/settlement";
import { actionUser } from "@/lib/auth";
import { formatINR, formatNumber } from "@/lib/format";
import { closeSchema, deleteSchema, invoiceSchema, type InvoiceData } from "@/lib/validators";
import { expire, parseInput, runAction, UserError, type ActionResult } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { lockOrderForChange, orderPosition } from "@/server/closing";
import { nextDocNumber } from "@/server/doc-numbers";
import { assertCanModifyEntry } from "@/server/permissions";
import type { SessionUser } from "@/lib/session";
import { TAG } from "@/server/tags";


async function validateRefs(data: InvoiceData) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, data.customerId));
  if (!customer) throw new UserError("Pick a customer.", { customerId: "Pick a customer" });
  const ids = data.items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length) throw new UserError("Each product can appear only once. Combine the quantities.");
  const prods = await db.select().from(products).where(inArray(products.id, ids));
  if (prods.length !== ids.length) throw new UserError("One of the products no longer exists.");
  if (data.dueDate && data.dueDate < data.invoiceDate) {
    throw new UserError("Due date can't be before the invoice date.", { dueDate: "Must be on or after the invoice date" });
  }
  return { customer, prods };
}


type ResolvedItem = { productId: number; quantity: number; rate: number; gstRate: number };
type ResolvedOrder = Omit<InvoiceData, "items" | "transportCharges"> & { items: ResolvedItem[]; transportCharges: number };

/**
 * Settle the money side of an order.
 * - Owners must give a rate for every product (GST defaults to the product's rate).
 * - Employees never see or send money: rates and GST come from the order's existing lines
 *   or the product settings, transport stays as it was.
 */
async function applyMoneyRules(
  user: SessionUser,
  data: InvoiceData,
  prods: (typeof products.$inferSelect)[],
  customerState: string | null,
  existing?: {
    items: { productId: number; rate: number; gstRate: number }[];
    transportCharges: number;
    taxType: "intra" | "inter";
    dueDate: string | null;
  },
): Promise<ResolvedOrder> {
  const product = (id: number) => prods.find((x) => x.id === id)!;
  if (user.role === "owner") {
    const fieldErrors: Record<string, string> = {};
    data.items.forEach((i, idx) => {
      if (!i.rate || i.rate <= 0) fieldErrors[`items.${idx}.rate`] = "Enter the rate";
    });
    if (Object.keys(fieldErrors).length) throw new UserError("Enter a rate for every product.", fieldErrors);
    return {
      ...data,
      transportCharges: data.transportCharges ?? 0,
      items: data.items.map((i) => ({ ...i, rate: i.rate!, gstRate: i.gstRate ?? product(i.productId).gstRate })),
    };
  }
  const [company] = await db
    .select({ stateName: companySettings.stateName, defaultDueDays: companySettings.defaultDueDays })
    .from(companySettings)
    .where(eq(companySettings.id, 1));
  const inter = !!(customerState && company?.stateName && customerState.trim().toLowerCase() !== company.stateName.trim().toLowerCase());
  return {
    ...data,
    // Payment terms are the owner's call: keep the order's due date, or apply the default from Settings.
    dueDate: existing?.dueDate ?? addDays(data.invoiceDate, company?.defaultDueDays ?? 15),
    taxType: existing?.taxType ?? (inter ? "inter" : "intra"),
    transportCharges: existing?.transportCharges ?? 0,
    items: data.items.map((i) => {
      const old = existing?.items.find((x) => x.productId === i.productId);
      const p = product(i.productId);
      return { ...i, rate: old?.rate ?? p.defaultRate, gstRate: old?.gstRate ?? p.gstRate };
    }),
  };
}

export async function createInvoice(input: unknown): Promise<ActionResult<{ id: number; invoiceNo: string }>> {
  return runAction(async () => {
    const user = await actionUser();
    const parsed = parseInput(invoiceSchema, input);
    const { customer, prods } = await validateRefs(parsed);
    const data = await applyMoneyRules(user, parsed, prods, customer.stateName);
    const totals = computeInvoiceTotals({ items: data.items, transportCharges: data.transportCharges, taxType: data.taxType });

    const result = await db.transaction(async (tx) => {
      const invoiceNo = await nextDocNumber(tx, "order", data.invoiceDate);
      const [inv] = await tx
        .insert(invoices)
        .values({
          invoiceNo,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate ?? null,
          customerId: data.customerId,
          deliveryAddress: data.deliveryAddress ?? customer.siteAddress,
          taxType: data.taxType,
          subtotal: totals.subtotal,
          transportCharges: totals.transportCharges,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          roundOff: totals.roundOff,
          total: totals.total,
          notes: data.notes ?? null,
          createdBy: user.id,
        })
        .returning({ id: invoices.id });
      await tx.insert(invoiceItems).values(
        totals.lines.map((l) => ({
          invoiceId: inv.id,
          productId: l.productId,
          quantity: l.quantity,
          rate: l.rate,
          gstRate: l.gstRate,
          amount: l.amount,
        })),
      );
      await audit(tx, {
        userId: user.id,
        action: "create",
        entity: "invoice",
        entityId: inv.id,
        summary: `Order ${invoiceNo} for ${customer.name}: ${data.items.map((i) => `${formatNumber(i.quantity)} × ${prods.find((p) => p.id === i.productId)?.name}`).join(", ")} (${formatINR(totals.total)})`,
        after: data,
      });
      return { id: inv.id, invoiceNo };
    });

    expire(TAG.invoices);
    return { ok: true, data: result, message: `Order ${result.invoiceNo} saved` };
  });
}

export async function updateInvoice(id: number, input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const user = await actionUser();
    const parsed = parseInput(invoiceSchema, input);
    const [existing] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!existing) throw new UserError("Order not found.");
    if (existing.status === "cancelled") throw new UserError("A cancelled order can't be edited.");
    if (existing.closedAt) throw new UserError(`Order ${existing.invoiceNo} is completed. Reopen it first to edit it.`);
    assertCanModifyEntry(user, existing);
    const { prods, customer } = await validateRefs(parsed);
    const existingItems = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    const data = await applyMoneyRules(user, parsed, prods, customer.stateName, {
      items: existingItems,
      transportCharges: existing.transportCharges,
      taxType: existing.taxType,
      dueDate: existing.dueDate,
    });

    // Already-delivered quantities set a floor on each product line.
    const delivered = await db
      .select({ productId: dispatchItems.productId, qty: sql<number>`sum(${dispatchItems.quantity})::int` })
      .from(dispatchItems)
      .innerJoin(dispatches, eq(dispatches.id, dispatchItems.dispatchId))
      .where(and(eq(dispatches.invoiceId, id), isNull(dispatches.deletedAt)))
      .groupBy(dispatchItems.productId);
    const fieldErrors: Record<string, string> = {};
    for (const d of delivered) {
      const idx = data.items.findIndex((i) => i.productId === d.productId);
      const name = prods.find((p) => p.id === d.productId)?.name ?? "This product";
      if (idx === -1) {
        throw new UserError(`${name} has already been delivered (${formatNumber(d.qty)}), so it can't be removed.`);
      }
      if (data.items[idx].quantity < d.qty) {
        fieldErrors[`items.${idx}.quantity`] = `At least ${formatNumber(d.qty)} (already delivered)`;
      }
    }
    if (Object.keys(fieldErrors).length) throw new UserError("Quantity can't be less than what's already delivered.", fieldErrors);

    if (data.customerId !== existing.customerId) {
      const [{ links }] = await db
        .select({
          links: sql<number>`(
            (select count(*) from dispatches where invoice_id = ${id} and deleted_at is null) +
            (select count(*) from payments where invoice_id = ${id} and deleted_at is null) +
            (select count(*) from adjustment_notes where invoice_id = ${id} and deleted_at is null))::int`,
        })
        .from(invoices)
        .where(eq(invoices.id, id));
      if (links > 0) throw new UserError("The customer can't be changed after deliveries or payments are recorded.");
    }

    const totals = computeInvoiceTotals({ items: data.items, transportCharges: data.transportCharges, taxType: data.taxType });
    await db.transaction(async (tx) => {
      await lockOrderForChange(tx, id);
      await tx
        .update(invoices)
        .set({
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate ?? null,
          customerId: data.customerId,
          deliveryAddress: data.deliveryAddress ?? null,
          taxType: data.taxType,
          subtotal: totals.subtotal,
          transportCharges: totals.transportCharges,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          roundOff: totals.roundOff,
          total: totals.total,
          notes: data.notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, id));
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      await tx.insert(invoiceItems).values(
        totals.lines.map((l) => ({
          invoiceId: id,
          productId: l.productId,
          quantity: l.quantity,
          rate: l.rate,
          gstRate: l.gstRate,
          amount: l.amount,
        })),
      );
      await audit(tx, {
        userId: user.id,
        action: "update",
        entity: "invoice",
        entityId: id,
        summary: `Edited order ${existing.invoiceNo}: ${formatINR(existing.total)} → ${formatINR(totals.total)}`,
        before: existing,
        after: data,
      });
    });
    expire(TAG.invoices);
    return { ok: true, data: { id }, message: "Order updated" };
  });
}

export async function cancelInvoice(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const { id, reason } = parseInput(deleteSchema, input);
    const [existing] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!existing) throw new UserError("Order not found.");
    if (existing.status === "cancelled") throw new UserError("This order is already cancelled.");
    if (existing.closedAt) throw new UserError("A completed order can't be cancelled. Reopen it first.");
    const [counts] = await db
      .select({
        dispatches: sql<number>`(select count(*) from ${dispatches} where invoice_id = ${id} and deleted_at is null)::int`,
        payments: sql<number>`(select count(*) from ${payments} where invoice_id = ${id} and deleted_at is null)::int`,
        notes: sql<number>`(select count(*) from ${adjustmentNotes} where invoice_id = ${id} and deleted_at is null)::int`,
      })
      .from(invoices)
      .where(eq(invoices.id, id));
    if (counts.dispatches > 0) throw new UserError("Bricks were already delivered on this order. Use a credit note instead of cancelling.");
    if (counts.payments > 0 || counts.notes > 0) {
      throw new UserError("Payments or notes are linked to this order. Delete or move them first.");
    }
    await db.transaction(async (tx) => {
      await tx.update(invoices).set({ status: "cancelled", cancelReason: reason, updatedAt: new Date() }).where(eq(invoices.id, id));
      await audit(tx, {
        userId: user.id,
        action: "cancel",
        entity: "invoice",
        entityId: id,
        summary: `Cancelled order ${existing.invoiceNo}: ${reason}`,
        before: existing,
      });
    });
    expire(TAG.invoices);
    return { ok: true, data: null, message: `Order ${existing.invoiceNo} cancelled` };
  });
}

/**
 * Mark orders completed. Each one must be fully delivered with debit = credit
 * (order total + debit notes = payments + credit notes). One order: a blocked close
 * is an error. Several ("Close all ready"): the ready ones close, the rest are reported.
 */
export async function closeInvoices(input: unknown): Promise<ActionResult<{ closed: number; skipped: number }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const { ids } = parseInput(closeSchema, input);
    const result = await db.transaction(async (tx) => {
      const closed: string[] = [];
      const skipped: { invoiceNo: string; reason: string }[] = [];
      for (const id of new Set(ids)) {
        const pos = await orderPosition(tx, id);
        if (!pos) {
          skipped.push({ invoiceNo: `#${id}`, reason: "Order not found." });
          continue;
        }
        const { invoice } = pos;
        const reason = orderCloseBlocker({
          cancelled: invoice.status === "cancelled",
          closed: !!invoice.closedAt,
          pending: pos.pending,
          balance: pos.balance,
        });
        if (reason) {
          skipped.push({ invoiceNo: invoice.invoiceNo, reason });
          continue;
        }
        await tx.update(invoices).set({ closedAt: new Date(), closedBy: user.id, updatedAt: new Date() }).where(eq(invoices.id, id));
        await audit(tx, {
          userId: user.id,
          action: "close",
          entity: "invoice",
          entityId: id,
          summary: `Completed order ${invoice.invoiceNo}: ${formatINR(pos.total + pos.debits)} billed = ${formatINR(pos.paid + pos.credits)} received`,
          after: { paid: pos.paid, credits: pos.credits, debits: pos.debits },
        });
        closed.push(invoice.invoiceNo);
      }
      return { closed, skipped };
    });

    if (result.closed.length === 0 && result.skipped.length === 1) throw new UserError(result.skipped[0].reason);
    if (result.closed.length) expire(TAG.invoices);
    const message =
      result.closed.length === 1 && result.skipped.length === 0
        ? `Order ${result.closed[0]} completed`
        : `${result.closed.length} order${result.closed.length === 1 ? "" : "s"} completed${result.skipped.length ? `, ${result.skipped.length} not ready` : ""}`;
    return { ok: true, data: { closed: result.closed.length, skipped: result.skipped.length }, message };
  });
}

/** Put a completed order back to ongoing (e.g. a payment was entered wrongly). The reason goes in the audit log. */
export async function reopenInvoice(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const { id, reason } = parseInput(deleteSchema, input);
    const invoiceNo = await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
      if (!inv) throw new UserError("Order not found.");
      if (!inv.closedAt) throw new UserError("This order is not completed.");
      await tx.update(invoices).set({ closedAt: null, closedBy: null, updatedAt: new Date() }).where(eq(invoices.id, id));
      await audit(tx, {
        userId: user.id,
        action: "reopen",
        entity: "invoice",
        entityId: id,
        summary: `Reopened order ${inv.invoiceNo}: ${reason}`,
        before: { closedAt: inv.closedAt, closedBy: inv.closedBy },
      });
      return inv.invoiceNo;
    });
    expire(TAG.invoices);
    return { ok: true, data: null, message: `Order ${invoiceNo} is ongoing again` };
  });
}
