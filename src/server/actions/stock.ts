"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { materials, products, stockAdjustments } from "@/db/schema";
import { actionUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { deleteSchema, stockAdjustmentSchema } from "@/lib/validators";
import { expire, parseInput, runAction, UserError, type ActionResult } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { actionToday } from "@/server/permissions";
import { TAG } from "@/server/tags";

export async function createStockAdjustment(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(stockAdjustmentSchema, input);
    if (data.adjDate > actionToday()) throw new UserError("The date can't be in the future.", { adjDate: "Can't be in the future" });
    const quantity = data.direction === "add" ? data.quantity : -data.quantity;

    let itemName = "";
    if (data.itemType === "material") {
      const [m] = await db.select().from(materials).where(eq(materials.id, data.materialId!));
      if (!m) throw new UserError("Pick a material.");
      itemName = `${formatNumber(Math.abs(quantity))} kg ${m.name}`;
    } else {
      const [p] = await db.select().from(products).where(eq(products.id, data.productId!));
      if (!p) throw new UserError("Pick a product.");
      itemName = `${formatNumber(Math.abs(quantity))} ${p.name}`;
    }

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(stockAdjustments)
        .values({
          adjDate: data.adjDate,
          itemType: data.itemType,
          materialId: data.itemType === "material" ? data.materialId! : null,
          productId: data.itemType === "product" ? data.productId! : null,
          quantity,
          reason: data.reason,
          createdBy: user.id,
        })
        .returning({ id: stockAdjustments.id });
      await audit(tx, {
        userId: user.id,
        action: "create",
        entity: "stock",
        entityId: row.id,
        summary: `Stock ${data.direction === "add" ? "added" : "removed"}: ${itemName} — ${data.reason}`,
        after: data,
      });
    });
    expire(TAG.stockAdj);
    return { ok: true, data: null, message: `Stock ${data.direction === "add" ? "increased" : "reduced"}: ${itemName}` };
  });
}

export async function deleteStockAdjustment(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const { id, reason } = parseInput(deleteSchema, input);
    const [existing] = await db
      .select()
      .from(stockAdjustments)
      .where(and(eq(stockAdjustments.id, id), isNull(stockAdjustments.deletedAt)));
    if (!existing) throw new UserError("Already deleted.");
    await db.transaction(async (tx) => {
      await tx.update(stockAdjustments).set({ deletedAt: new Date(), deleteReason: reason }).where(eq(stockAdjustments.id, id));
      await audit(tx, { userId: user.id, action: "delete", entity: "stock", entityId: id, summary: `Deleted stock adjustment #${id}: ${reason}`, before: existing });
    });
    expire(TAG.stockAdj);
    return { ok: true, data: null, message: "Adjustment deleted" };
  });
}
