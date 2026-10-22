"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { dispatchItems, dispatches, invoiceItems, invoices, products } from "@/db/schema";
import { validateDispatch } from "@/domain/dispatch";
import { actionUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { deleteSchema, dispatchSchema } from "@/lib/validators";
import { expire, parseInput, runAction, UserError, type ActionResult } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { nextDocNumber } from "@/server/doc-numbers";
import { assertCanModifyEntry, assertEntryDate } from "@/server/permissions";
import { TAG } from "@/server/tags";

type DispatchData = ReturnType<typeof dispatchSchema.parse>;

/**
 * Lock the invoice row and work out what is still pending per product, so two people
 * dispatching against the same invoice at once can't over-deliver.
 */
async function pendingFor(tx: Tx, data: DispatchData, excludeDispatchId?: number) {
  const [inv] = await tx
    .select()
    .from(invoices)
    .where(eq(invoices.id, data.invoiceId))
    .for("update");
  if (!inv) throw new UserError("Pick an order.", { invoiceId: "Pick an order" });
  if (inv.customerId !== data.customerId) throw new UserError("That order belongs to a different customer.");
  if (inv.status === "cancelled") throw new UserError("That order was cancelled.");

  const ordered = await tx
    .select({ productId: invoiceItems.productId, qty: sql<number>`sum(${invoiceItems.quantity})::int` })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, data.invoiceId))
    .groupBy(invoiceItems.productId);
  const delivered = await tx
    .select({ productId: dispatchItems.productId, qty: sql<number>`sum(${dispatchItems.quantity})::int` })
    .from(dispatchItems)
    .innerJoin(dispatches, eq(dispatches.id, dispatchItems.dispatchId))
    .where(
      and(
        eq(dispatches.invoiceId, data.invoiceId),
        isNull(dispatches.deletedAt),
        excludeDispatchId ? ne(dispatches.id, excludeDispatchId) : undefined,
      ),
    )
    .groupBy(dispatchItems.productId);
  const pending = new Map<number, number>();
  for (const o of ordered) pending.set(o.productId, o.qty - (delivered.find((d) => d.productId === o.productId)?.qty ?? 0));

  const names = new Map((await tx.select({ id: products.id, name: products.name }).from(products)).map((p) => [p.id, p.name]));
  const { errors, formError } = validateDispatch(pending, data.lines, (id) => names.get(id) ?? "Product");
  if (formError) throw new UserError(formError);
  if (errors.size) {
    const fieldErrors: Record<string, string> = {};
    data.lines.forEach((l, i) => {
      const e = errors.get(l.productId);
      if (e) fieldErrors[`lines.${i}.quantity`] = e;
    });
    throw new UserError([...errors.values()][0], fieldErrors);
  }
  return { invoice: inv, names };
}

export async function createDispatch(input: unknown): Promise<ActionResult<{ id: number; dispatchNo: string }>> {
  return runAction(async () => {
    const user = await actionUser();
    const data = parseInput(dispatchSchema, input);
    assertEntryDate(user, data.dispatchDate, "dispatchDate");

    const result = await db.transaction(async (tx) => {
      const { invoice, names } = await pendingFor(tx, data);
      const lines = data.lines.filter((l) => l.quantity > 0);
      const dispatchNo = await nextDocNumber(tx, "dispatch", data.dispatchDate);
      const [row] = await tx
        .insert(dispatches)
        .values({
          dispatchNo,
          dispatchDate: data.dispatchDate,
          customerId: data.customerId,
          invoiceId: data.invoiceId,
          vehicleNo: data.vehicleNo ?? null,
          driverName: data.driverName ?? null,
          driverPhone: data.driverPhone ?? null,
          remarks: data.remarks ?? null,
          createdBy: user.id,
        })
        .returning({ id: dispatches.id });
      await tx.insert(dispatchItems).values(lines.map((l) => ({ dispatchId: row.id, productId: l.productId, quantity: l.quantity })));
      const summary = lines.map((l) => `${formatNumber(l.quantity)} ${names.get(l.productId)}`).join(" + ");
      await audit(tx, {
        userId: user.id,
        action: "create",
        entity: "dispatch",
        entityId: row.id,
        summary: `Dispatch ${dispatchNo} (${invoice.invoiceNo}): ${summary}`,
        after: data,
      });
      return { id: row.id, dispatchNo, summary };
    });

    expire(TAG.dispatch);
    return { ok: true, data: { id: result.id, dispatchNo: result.dispatchNo }, message: `${result.dispatchNo}: ${result.summary}` };
  });
}

export async function updateDispatch(id: number, input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const user = await actionUser();
    const data = parseInput(dispatchSchema, input);
    const [existing] = await db.select().from(dispatches).where(and(eq(dispatches.id, id), isNull(dispatches.deletedAt)));
    if (!existing) throw new UserError("This dispatch no longer exists.");
    assertCanModifyEntry(user, existing);
    assertEntryDate(user, data.dispatchDate, "dispatchDate");

    await db.transaction(async (tx) => {
      await pendingFor(tx, data, id);
      await tx
        .update(dispatches)
        .set({
          dispatchDate: data.dispatchDate,
          customerId: data.customerId,
          invoiceId: data.invoiceId,
          vehicleNo: data.vehicleNo ?? null,
          driverName: data.driverName ?? null,
          driverPhone: data.driverPhone ?? null,
          remarks: data.remarks ?? null,
          updatedAt: new Date(),
        })
        .where(eq(dispatches.id, id));
      await tx.delete(dispatchItems).where(eq(dispatchItems.dispatchId, id));
      await tx
        .insert(dispatchItems)
        .values(data.lines.filter((l) => l.quantity > 0).map((l) => ({ dispatchId: id, productId: l.productId, quantity: l.quantity })));
      await audit(tx, {
        userId: user.id,
        action: "update",
        entity: "dispatch",
        entityId: id,
        summary: `Edited dispatch ${existing.dispatchNo}`,
        before: existing,
        after: data,
      });
    });
    expire(TAG.dispatch);
    return { ok: true, data: { id }, message: "Dispatch updated" };
  });
}

export async function deleteDispatch(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser();
    const { id, reason } = parseInput(deleteSchema, input);
    const [existing] = await db.select().from(dispatches).where(and(eq(dispatches.id, id), isNull(dispatches.deletedAt)));
    if (!existing) throw new UserError("This dispatch was already deleted.");
    assertCanModifyEntry(user, existing);
    await db.transaction(async (tx) => {
      await tx.update(dispatches).set({ deletedAt: new Date(), deleteReason: reason }).where(eq(dispatches.id, id));
      await audit(tx, {
        userId: user.id,
        action: "delete",
        entity: "dispatch",
        entityId: id,
        summary: `Deleted dispatch ${existing.dispatchNo}: ${reason}`,
        before: existing,
      });
    });
    expire(TAG.dispatch);
    return { ok: true, data: null, message: `${existing.dispatchNo} deleted` };
  });
}
