"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { productionEntries, products } from "@/db/schema";
import { actionUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { deleteSchema, productionSchema, type ProductionData } from "@/lib/validators";
import { expire, parseInput, runAction, UserError, type ActionResult } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { assertCanModifyEntry, assertEntryDate } from "@/server/permissions";
import { TAG } from "@/server/tags";

async function productOrThrow(id: number) {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  if (!p) throw new UserError("Pick a product.", { productId: "Pick a product" });
  return p;
}

/** Above-capacity days are allowed (overtime happens) but flagged. */
async function capacityWarning(data: ProductionData, capacity: number, name: string, excludeId?: number) {
  const [{ qty }] = await db
    .select({ qty: sql<number>`coalesce(sum(${productionEntries.quantityProduced}), 0)::int` })
    .from(productionEntries)
    .where(
      and(
        eq(productionEntries.entryDate, data.entryDate),
        eq(productionEntries.productId, data.productId),
        isNull(productionEntries.deletedAt),
        excludeId ? ne(productionEntries.id, excludeId) : undefined,
      ),
    );
  const dayTotal = qty + data.quantityProduced;
  return dayTotal > capacity
    ? [`${name}: ${formatNumber(dayTotal)} for the day is above the daily capacity of ${formatNumber(capacity)}.`]
    : [];
}

export async function createProduction(input: unknown): Promise<ActionResult<{ id: number; warnings: string[] }>> {
  return runAction(async () => {
    const user = await actionUser();
    const data = parseInput(productionSchema, input);
    assertEntryDate(user, data.entryDate);
    const product = await productOrThrow(data.productId);
    const warnings = await capacityWarning(data, product.dailyCapacity, product.name);

    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(productionEntries)
        .values({
          entryDate: data.entryDate,
          productId: data.productId,
          shift: "full",
          quantityProduced: data.quantityProduced,
          quantityRejected: data.quantityRejected,
          createdBy: user.id,
        })
        .returning({ id: productionEntries.id });
      await audit(tx, {
        userId: user.id,
        action: "create",
        entity: "production",
        entityId: row.id,
        summary: `Production ${data.entryDate}: ${formatNumber(data.quantityProduced)} ${product.name}`,
        after: data,
      });
      return row.id;
    });

    expire(TAG.production);
    return {
      ok: true,
      data: { id, warnings },
      message: `Saved ${formatNumber(data.quantityProduced)} ${product.name}`,
    };
  });
}

export async function updateProduction(id: number, input: unknown): Promise<ActionResult<{ warnings: string[] }>> {
  return runAction(async () => {
    const user = await actionUser();
    const data = parseInput(productionSchema, input);
    const [existing] = await db
      .select()
      .from(productionEntries)
      .where(and(eq(productionEntries.id, id), isNull(productionEntries.deletedAt)));
    if (!existing) throw new UserError("This entry no longer exists.");
    assertCanModifyEntry(user, existing);
    assertEntryDate(user, data.entryDate);
    const product = await productOrThrow(data.productId);
    const warnings = await capacityWarning(data, product.dailyCapacity, product.name, id);

    await db.transaction(async (tx) => {
      await tx
        .update(productionEntries)
        .set({
          entryDate: data.entryDate,
          productId: data.productId,
          quantityProduced: data.quantityProduced,
          quantityRejected: data.quantityRejected,
          updatedAt: new Date(),
        })
        .where(eq(productionEntries.id, id));
      await audit(tx, {
        userId: user.id,
        action: "update",
        entity: "production",
        entityId: id,
        summary: `Edited production #${id}`,
        before: existing,
        after: data,
      });
    });
    expire(TAG.production);
    return { ok: true, data: { warnings }, message: "Production updated" };
  });
}

export async function deleteProduction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser();
    const { id, reason } = parseInput(deleteSchema, input);
    const [existing] = await db
      .select()
      .from(productionEntries)
      .where(and(eq(productionEntries.id, id), isNull(productionEntries.deletedAt)));
    if (!existing) throw new UserError("This entry was already deleted.");
    assertCanModifyEntry(user, existing);
    await db.transaction(async (tx) => {
      await tx
        .update(productionEntries)
        .set({ deletedAt: new Date(), deleteReason: reason })
        .where(eq(productionEntries.id, id));
      await audit(tx, {
        userId: user.id,
        action: "delete",
        entity: "production",
        entityId: id,
        summary: `Deleted production #${id}: ${reason}`,
        before: existing,
      });
    });
    expire(TAG.production);
    return { ok: true, data: null, message: "Entry deleted" };
  });
}
