"use server";

import { and, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { inboundEntries, materials, purchaseBillItems, purchaseBills, supplierNotes, supplierPayments, suppliers } from "@/db/schema";
import { computeInvoiceTotals } from "@/domain/invoice";
import { round2 } from "@/domain/money";
import { billCloseBlocker } from "@/domain/settlement";
import { actionUser } from "@/lib/auth";
import { formatINR, formatTonnes } from "@/lib/format";
import {
  closeSchema,
  deleteSchema,
  purchaseBillSchema,
  supplierNoteSchema,
  supplierPaymentSchema,
  type PurchaseBillData,
} from "@/lib/validators";
import { expire, parseInput, runAction, UserError, type ActionResult } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { billPosition, lockBillForChange } from "@/server/closing";
import { nextDocNumber } from "@/server/doc-numbers";
import { actionToday } from "@/server/permissions";
import { TAG } from "@/server/tags";

/* ------------------------------------------------------------------ */
/* Bills                                                               */
/* ------------------------------------------------------------------ */

async function validateBill(data: PurchaseBillData, billId?: number) {
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, data.supplierId));
  if (!supplier) throw new UserError("Pick a supplier.", { supplierId: "Pick a supplier" });
  if (data.billDate > actionToday()) throw new UserError("The bill date can't be in the future.", { billDate: "Can't be in the future" });
  if (data.dueDate && data.dueDate < data.billDate) {
    throw new UserError("Due date can't be before the bill date.", { dueDate: "Must be on or after the bill date" });
  }
  const ids = data.items.map((i) => i.materialId);
  if (new Set(ids).size !== ids.length) throw new UserError("Each material can appear only once. Combine the quantities.");
  const mats = await db.select().from(materials).where(inArray(materials.id, ids));
  if (mats.length !== ids.length) throw new UserError("One of the materials no longer exists.");

  // The same supplier invoice entered twice is the commonest double payment.
  if (data.supplierBillNo) {
    const [dupe] = await db
      .select({ billNo: purchaseBills.billNo })
      .from(purchaseBills)
      .where(
        and(
          eq(purchaseBills.supplierId, data.supplierId),
          eq(purchaseBills.status, "active"),
          sql`lower(${purchaseBills.supplierBillNo}) = lower(${data.supplierBillNo})`,
          billId ? ne(purchaseBills.id, billId) : undefined,
        ),
      );
    if (dupe) {
      throw new UserError(`This supplier bill is already entered as ${dupe.billNo}.`, { supplierBillNo: `Already entered as ${dupe.billNo}` });
    }
  }
  return { supplier, mats };
}

/** Lock the chosen inbound loads and check they can go on this bill. */
async function lockLoads(tx: Tx, data: PurchaseBillData, billId?: number) {
  const loadIds = [...new Set(data.loadIds)];
  if (loadIds.length === 0) return [];
  const loads = await tx
    .select()
    .from(inboundEntries)
    .where(and(inArray(inboundEntries.id, loadIds), isNull(inboundEntries.deletedAt)))
    .for("update");
  if (loads.length !== loadIds.length) throw new UserError("One of the loads was deleted. Reload the form and try again.");
  const billed = new Set(data.items.map((i) => i.materialId));
  for (const l of loads) {
    if (l.supplierId !== data.supplierId) throw new UserError("Every load on the bill must be from this supplier.");
    if (l.purchaseBillId && l.purchaseBillId !== billId) throw new UserError("One of the loads is already on another bill.");
    if (!billed.has(l.materialId)) throw new UserError("A ticked load's material isn't on the bill. Add that material or untick the load.");
  }
  return loads;
}

function billTotals(data: PurchaseBillData) {
  return computeInvoiceTotals({
    items: data.items.map((i) => ({ productId: i.materialId, quantity: i.quantityTonnes, rate: i.ratePerTon, gstRate: i.gstRate })),
    transportCharges: data.transportCharges ?? 0,
    taxType: data.taxType,
  });
}

/** Write the bill's lines and point its loads at it, copying the bill rate onto each load. */
async function writeLinesAndLoads(tx: Tx, billId: number, data: PurchaseBillData, totals: ReturnType<typeof billTotals>, loads: { id: number; materialId: number; netKg: number }[]) {
  await tx.insert(purchaseBillItems).values(
    totals.lines.map((l) => ({
      billId,
      materialId: l.productId,
      quantityKg: round2(l.quantity * 1000),
      ratePerTon: l.rate,
      gstRate: l.gstRate,
      amount: l.amount,
    })),
  );
  for (const load of loads) {
    const rate = data.items.find((i) => i.materialId === load.materialId)!.ratePerTon;
    await tx
      .update(inboundEntries)
      .set({ purchaseBillId: billId, ratePerTon: rate, amount: round2((load.netKg / 1000) * rate), updatedAt: new Date() })
      .where(eq(inboundEntries.id, load.id));
  }
}

async function unlinkLoads(tx: Tx, billId: number, keep: number[] = []) {
  await tx
    .update(inboundEntries)
    .set({ purchaseBillId: null, ratePerTon: null, amount: null, updatedAt: new Date() })
    .where(and(eq(inboundEntries.purchaseBillId, billId), keep.length ? notInArray(inboundEntries.id, keep) : undefined));
}

const describeItems = (data: PurchaseBillData, mats: { id: number; name: string }[]) =>
  data.items.map((i) => `${formatTonnes(i.quantityTonnes * 1000)} ${mats.find((m) => m.id === i.materialId)?.name}`).join(", ");

export async function createPurchaseBill(input: unknown): Promise<ActionResult<{ id: number; billNo: string }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(purchaseBillSchema, input);
    const { supplier, mats } = await validateBill(data);
    const totals = billTotals(data);

    const result = await db.transaction(async (tx) => {
      const loads = await lockLoads(tx, data);
      const billNo = await nextDocNumber(tx, "purchaseBill", data.billDate);
      const [bill] = await tx
        .insert(purchaseBills)
        .values({
          billNo,
          supplierBillNo: data.supplierBillNo ?? null,
          billDate: data.billDate,
          dueDate: data.dueDate ?? null,
          supplierId: data.supplierId,
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
        .returning({ id: purchaseBills.id });
      await writeLinesAndLoads(tx, bill.id, data, totals, loads);
      await audit(tx, {
        userId: user.id,
        action: "create",
        entity: "purchase_bill",
        entityId: bill.id,
        summary: `Bill ${billNo} from ${supplier.name}: ${describeItems(data, mats)} (${formatINR(totals.total)}, ${loads.length} loads)`,
        after: data,
      });
      return { id: bill.id, billNo };
    });

    expire(TAG.purchases, TAG.inbound);
    return { ok: true, data: result, message: `Bill ${result.billNo} saved: ${formatINR(totals.total)} to pay ${supplier.name}` };
  });
}

export async function updatePurchaseBill(id: number, input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(purchaseBillSchema, input);
    const { mats } = await validateBill(data, id);
    const totals = billTotals(data);

    const billNo = await db.transaction(async (tx) => {
      const existing = await lockBillForChange(tx, id);
      if (existing.status === "cancelled") throw new UserError("A cancelled bill can't be edited.");
      if (data.supplierId !== existing.supplierId) {
        const [{ links }] = await tx.execute<{ links: number }>(sql`
          select ((select count(*) from supplier_payments where bill_id = ${id} and deleted_at is null) +
                  (select count(*) from supplier_notes where bill_id = ${id} and deleted_at is null))::int as links`);
        if (links > 0) throw new UserError("The supplier can't be changed after payments or notes are recorded on this bill.");
      }
      const loads = await lockLoads(tx, data, id);
      await tx
        .update(purchaseBills)
        .set({
          supplierBillNo: data.supplierBillNo ?? null,
          billDate: data.billDate,
          dueDate: data.dueDate ?? null,
          supplierId: data.supplierId,
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
        .where(eq(purchaseBills.id, id));
      await tx.delete(purchaseBillItems).where(eq(purchaseBillItems.billId, id));
      await unlinkLoads(tx, id, loads.map((l) => l.id));
      await writeLinesAndLoads(tx, id, data, totals, loads);
      await audit(tx, {
        userId: user.id,
        action: "update",
        entity: "purchase_bill",
        entityId: id,
        summary: `Edited bill ${existing.billNo}: ${describeItems(data, mats)} · ${formatINR(existing.total)} → ${formatINR(totals.total)}`,
        before: existing,
        after: data,
      });
      return existing.billNo;
    });
    expire(TAG.purchases, TAG.inbound);
    return { ok: true, data: { id }, message: `Bill ${billNo} updated` };
  });
}

export async function cancelPurchaseBill(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const { id, reason } = parseInput(deleteSchema, input);
    const billNo = await db.transaction(async (tx) => {
      const existing = await lockBillForChange(tx, id);
      if (existing.status === "cancelled") throw new UserError("This bill is already cancelled.");
      const [{ links }] = await tx.execute<{ links: number }>(sql`
        select ((select count(*) from supplier_payments where bill_id = ${id} and deleted_at is null) +
                (select count(*) from supplier_notes where bill_id = ${id} and deleted_at is null))::int as links`);
      if (links > 0) throw new UserError("Payments or notes are recorded against this bill. Delete them first.");
      await unlinkLoads(tx, id);
      await tx.update(purchaseBills).set({ status: "cancelled", cancelReason: reason, updatedAt: new Date() }).where(eq(purchaseBills.id, id));
      await audit(tx, {
        userId: user.id,
        action: "cancel",
        entity: "purchase_bill",
        entityId: id,
        summary: `Cancelled bill ${existing.billNo}: ${reason}`,
        before: existing,
      });
      return existing.billNo;
    });
    expire(TAG.purchases, TAG.inbound);
    return { ok: true, data: null, message: `Bill ${billNo} cancelled. Its loads are unbilled again.` };
  });
}

/** Close bills whose debit = credit (bill + extra charges = paid + supplier credits). */
export async function closePurchaseBills(input: unknown): Promise<ActionResult<{ closed: number; skipped: number }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const { ids } = parseInput(closeSchema, input);
    const result = await db.transaction(async (tx) => {
      const closed: string[] = [];
      const skipped: { billNo: string; reason: string }[] = [];
      for (const id of new Set(ids)) {
        const pos = await billPosition(tx, id);
        if (!pos) {
          skipped.push({ billNo: `#${id}`, reason: "Bill not found." });
          continue;
        }
        const reason = billCloseBlocker({ cancelled: pos.bill.status === "cancelled", closed: !!pos.bill.closedAt, balance: pos.balance });
        if (reason) {
          skipped.push({ billNo: pos.bill.billNo, reason });
          continue;
        }
        await tx.update(purchaseBills).set({ closedAt: new Date(), closedBy: user.id, updatedAt: new Date() }).where(eq(purchaseBills.id, id));
        await audit(tx, {
          userId: user.id,
          action: "close",
          entity: "purchase_bill",
          entityId: id,
          summary: `Closed bill ${pos.bill.billNo}: ${formatINR(pos.total + pos.debits)} billed = ${formatINR(pos.paid + pos.credits)} paid`,
          after: { paid: pos.paid, credits: pos.credits, debits: pos.debits },
        });
        closed.push(pos.bill.billNo);
      }
      return { closed, skipped };
    });
    if (result.closed.length === 0 && result.skipped.length === 1) throw new UserError(result.skipped[0].reason);
    if (result.closed.length) expire(TAG.purchases);
    const message =
      result.closed.length === 1 && result.skipped.length === 0
        ? `Bill ${result.closed[0]} closed`
        : `${result.closed.length} bill${result.closed.length === 1 ? "" : "s"} closed${result.skipped.length ? `, ${result.skipped.length} not ready` : ""}`;
    return { ok: true, data: { closed: result.closed.length, skipped: result.skipped.length }, message };
  });
}

export async function reopenPurchaseBill(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const { id, reason } = parseInput(deleteSchema, input);
    const billNo = await db.transaction(async (tx) => {
      const [bill] = await tx.select().from(purchaseBills).where(eq(purchaseBills.id, id)).for("update");
      if (!bill) throw new UserError("Bill not found.");
      if (!bill.closedAt) throw new UserError("This bill is not closed.");
      await tx.update(purchaseBills).set({ closedAt: null, closedBy: null, updatedAt: new Date() }).where(eq(purchaseBills.id, id));
      await audit(tx, {
        userId: user.id,
        action: "reopen",
        entity: "purchase_bill",
        entityId: id,
        summary: `Reopened bill ${bill.billNo}: ${reason}`,
        before: { closedAt: bill.closedAt, closedBy: bill.closedBy },
      });
      return bill.billNo;
    });
    expire(TAG.purchases);
    return { ok: true, data: null, message: `Bill ${billNo} is ongoing again` };
  });
}

/* ------------------------------------------------------------------ */
/* Payments to suppliers & supplier notes                              */
/* ------------------------------------------------------------------ */

async function checkSupplierBill(tx: Tx, supplierId: number, billId: number | undefined) {
  const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, supplierId));
  if (!supplier) throw new UserError("Pick a supplier.", { supplierId: "Pick a supplier" });
  if (!billId) return { supplier, bill: null };
  const bill = await lockBillForChange(tx, billId);
  if (bill.supplierId !== supplierId) throw new UserError("That bill belongs to a different supplier.");
  if (bill.status === "cancelled") throw new UserError("That bill was cancelled.");
  return { supplier, bill };
}

export async function createSupplierPayment(input: unknown): Promise<ActionResult<{ id: number; voucherNo: string }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(supplierPaymentSchema, input);
    if (data.paymentDate > actionToday()) throw new UserError("The date can't be in the future.", { paymentDate: "Can't be in the future" });

    const result = await db.transaction(async (tx) => {
      const { supplier, bill } = await checkSupplierBill(tx, data.supplierId, data.billId);
      const voucherNo = await nextDocNumber(tx, "supplierPayment", data.paymentDate);
      const [row] = await tx
        .insert(supplierPayments)
        .values({
          voucherNo,
          paymentDate: data.paymentDate,
          supplierId: data.supplierId,
          billId: data.billId ?? null,
          amount: data.amount,
          mode: data.mode,
          reference: data.reference ?? null,
          remarks: data.remarks ?? null,
          createdBy: user.id,
        })
        .returning({ id: supplierPayments.id });
      await audit(tx, {
        userId: user.id,
        action: "create",
        entity: "supplier_payment",
        entityId: row.id,
        summary: `Paid ${formatINR(data.amount)} to ${supplier.name} (${voucherNo})${bill ? ` for ${bill.billNo}` : " on account"}`,
        after: data,
      });
      return { id: row.id, voucherNo, supplierName: supplier.name };
    });
    expire(TAG.purchases);
    return { ok: true, data: { id: result.id, voucherNo: result.voucherNo }, message: `${formatINR(data.amount)} paid to ${result.supplierName}` };
  });
}

export async function deleteSupplierPayment(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const { id, reason } = parseInput(deleteSchema, input);
    const voucherNo = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(supplierPayments).where(and(eq(supplierPayments.id, id), isNull(supplierPayments.deletedAt)));
      if (!existing) throw new UserError("This payment was already deleted.");
      if (existing.billId) await lockBillForChange(tx, existing.billId);
      await tx.update(supplierPayments).set({ deletedAt: new Date(), deleteReason: reason }).where(eq(supplierPayments.id, id));
      await audit(tx, {
        userId: user.id,
        action: "delete",
        entity: "supplier_payment",
        entityId: id,
        summary: `Deleted supplier payment ${existing.voucherNo} (${formatINR(existing.amount)}): ${reason}`,
        before: existing,
      });
      return existing.voucherNo;
    });
    expire(TAG.purchases);
    return { ok: true, data: null, message: `${voucherNo} deleted` };
  });
}

export async function createSupplierNote(input: unknown): Promise<ActionResult<{ id: number; noteNo: string }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(supplierNoteSchema, input);
    if (data.noteDate > actionToday()) throw new UserError("The date can't be in the future.", { noteDate: "Can't be in the future" });

    const result = await db.transaction(async (tx) => {
      const { supplier, bill } = await checkSupplierBill(tx, data.supplierId, data.billId);
      const noteNo = await nextDocNumber(tx, data.type === "credit" ? "supplierCredit" : "supplierDebit", data.noteDate);
      const [row] = await tx
        .insert(supplierNotes)
        .values({
          noteNo,
          type: data.type,
          noteDate: data.noteDate,
          supplierId: data.supplierId,
          billId: data.billId ?? null,
          amount: data.amount,
          reason: data.reason,
          description: data.description ?? null,
          createdBy: user.id,
        })
        .returning({ id: supplierNotes.id });
      await audit(tx, {
        userId: user.id,
        action: "create",
        entity: "supplier_note",
        entityId: row.id,
        summary: `${data.type === "credit" ? "Credit from" : "Extra charge by"} ${supplier.name} ${noteNo}: ${formatINR(data.amount)}${bill ? ` (${bill.billNo})` : ""}`,
        after: data,
      });
      return { id: row.id, noteNo };
    });
    expire(TAG.purchases);
    return { ok: true, data: result, message: `${result.noteNo} saved` };
  });
}

export async function deleteSupplierNote(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const { id, reason } = parseInput(deleteSchema, input);
    const noteNo = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(supplierNotes).where(and(eq(supplierNotes.id, id), isNull(supplierNotes.deletedAt)));
      if (!existing) throw new UserError("This note was already deleted.");
      if (existing.billId) await lockBillForChange(tx, existing.billId);
      await tx.update(supplierNotes).set({ deletedAt: new Date(), deleteReason: reason }).where(eq(supplierNotes.id, id));
      await audit(tx, {
        userId: user.id,
        action: "delete",
        entity: "supplier_note",
        entityId: id,
        summary: `Deleted supplier note ${existing.noteNo}: ${reason}`,
        before: existing,
      });
      return existing.noteNo;
    });
    expire(TAG.purchases);
    return { ok: true, data: null, message: `${noteNo} deleted` };
  });
}
