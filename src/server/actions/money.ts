"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { adjustmentNotes, customers, invoices, payments } from "@/db/schema";
import { actionUser } from "@/lib/auth";
import { formatINR } from "@/lib/format";
import { deleteSchema, noteSchema, paymentSchema } from "@/lib/validators";
import { expire, parseInput, runAction, UserError, type ActionResult } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { nextDocNumber } from "@/server/doc-numbers";
import { actionToday } from "@/server/permissions";
import { TAG } from "@/server/tags";

async function checkCustomerInvoice(customerId: number, invoiceId: number | undefined) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) throw new UserError("Pick a customer.", { customerId: "Pick a customer" });
  if (invoiceId) {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv || inv.customerId !== customerId) throw new UserError("That order belongs to a different customer.");
    if (inv.status === "cancelled") throw new UserError("That order was cancelled.");
    return { customer, invoice: inv };
  }
  return { customer, invoice: null };
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

export async function createPayment(input: unknown): Promise<ActionResult<{ id: number; receiptNo: string }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(paymentSchema, input);
    if (data.paymentDate > actionToday()) throw new UserError("The date can't be in the future.", { paymentDate: "Can't be in the future" });
    const { customer, invoice } = await checkCustomerInvoice(data.customerId, data.invoiceId);

    const result = await db.transaction(async (tx) => {
      const receiptNo = await nextDocNumber(tx, "receipt", data.paymentDate);
      const [row] = await tx
        .insert(payments)
        .values({
          receiptNo,
          paymentDate: data.paymentDate,
          customerId: data.customerId,
          invoiceId: data.invoiceId ?? null,
          amount: data.amount,
          mode: data.mode,
          reference: data.reference ?? null,
          remarks: data.remarks ?? null,
          createdBy: user.id,
        })
        .returning({ id: payments.id });
      await audit(tx, {
        userId: user.id,
        action: "create",
        entity: "payment",
        entityId: row.id,
        summary: `Payment ${receiptNo}: ${formatINR(data.amount)} from ${customer.name}${invoice ? ` for ${invoice.invoiceNo}` : " (on account)"}`,
        after: data,
      });
      return { id: row.id, receiptNo };
    });
    expire(TAG.payments);
    return { ok: true, data: result, message: `${formatINR(data.amount)} received from ${customer.firmName ?? customer.name}` };
  });
}

export async function deletePayment(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const { id, reason } = parseInput(deleteSchema, input);
    const [existing] = await db.select().from(payments).where(and(eq(payments.id, id), isNull(payments.deletedAt)));
    if (!existing) throw new UserError("This payment was already deleted.");
    await db.transaction(async (tx) => {
      await tx.update(payments).set({ deletedAt: new Date(), deleteReason: reason }).where(eq(payments.id, id));
      await audit(tx, {
        userId: user.id,
        action: "delete",
        entity: "payment",
        entityId: id,
        summary: `Deleted payment ${existing.receiptNo} (${formatINR(existing.amount)}): ${reason}`,
        before: existing,
      });
    });
    expire(TAG.payments);
    return { ok: true, data: null, message: `${existing.receiptNo} deleted` };
  });
}

/* ------------------------------------------------------------------ */
/* Credit / debit notes                                                */
/* ------------------------------------------------------------------ */

export async function createNote(input: unknown): Promise<ActionResult<{ id: number; noteNo: string }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(noteSchema, input);
    if (data.noteDate > actionToday()) throw new UserError("The date can't be in the future.", { noteDate: "Can't be in the future" });
    const { customer, invoice } = await checkCustomerInvoice(data.customerId, data.invoiceId);

    const result = await db.transaction(async (tx) => {
      const noteNo = await nextDocNumber(tx, data.type === "credit" ? "creditNote" : "debitNote", data.noteDate);
      const [row] = await tx
        .insert(adjustmentNotes)
        .values({
          noteNo,
          type: data.type,
          noteDate: data.noteDate,
          customerId: data.customerId,
          invoiceId: data.invoiceId ?? null,
          amount: data.amount,
          reason: data.reason,
          description: data.description ?? null,
          createdBy: user.id,
        })
        .returning({ id: adjustmentNotes.id });
      await audit(tx, {
        userId: user.id,
        action: "create",
        entity: "note",
        entityId: row.id,
        summary: `${data.type === "credit" ? "Credit" : "Debit"} note ${noteNo}: ${formatINR(data.amount)} for ${customer.name}${invoice ? ` (${invoice.invoiceNo})` : ""}`,
        after: data,
      });
      return { id: row.id, noteNo };
    });
    expire(TAG.notes);
    return { ok: true, data: result, message: `${result.noteNo} saved` };
  });
}

export async function deleteNote(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const { id, reason } = parseInput(deleteSchema, input);
    const [existing] = await db
      .select()
      .from(adjustmentNotes)
      .where(and(eq(adjustmentNotes.id, id), isNull(adjustmentNotes.deletedAt)));
    if (!existing) throw new UserError("This note was already deleted.");
    await db.transaction(async (tx) => {
      await tx.update(adjustmentNotes).set({ deletedAt: new Date(), deleteReason: reason }).where(eq(adjustmentNotes.id, id));
      await audit(tx, {
        userId: user.id,
        action: "delete",
        entity: "note",
        entityId: id,
        summary: `Deleted note ${existing.noteNo}: ${reason}`,
        before: existing,
      });
    });
    expire(TAG.notes);
    return { ok: true, data: null, message: `${existing.noteNo} deleted` };
  });
}
