"use server";

import { and, eq, ilike, ne } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { actionUser } from "@/lib/auth";
import { supplierSchema } from "@/lib/validators";
import { expire, parseInput, runAction, UserError, type ActionResult } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { TAG } from "@/server/tags";

/** Owners and employees can both add and edit suppliers; only owners can hide one. */
export async function saveSupplier(id: number | null, input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const user = await actionUser();
    const data = parseInput(supplierSchema, input);
    const [dupe] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(ilike(suppliers.name, data.name), id ? ne(suppliers.id, id) : undefined));
    if (dupe) throw new UserError("A supplier with this name already exists.", { name: "Already added" });

    let active = data.active;
    // Employees never see money: they can't set or change the opening balance.
    let openingBalance = user.role === "owner" ? (data.openingBalance ?? 0) : 0;
    if (id) {
      const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, id));
      if (!existing) throw new UserError("Supplier not found.");
      if (user.role !== "owner") {
        active = existing.active;
        openingBalance = existing.openingBalance;
      }
    } else {
      active = true;
    }

    const values = {
      name: data.name,
      phone: data.phone ?? null,
      gstin: data.gstin ?? null,
      address: data.address ?? null,
      openingBalance,
      active,
    };
    const savedId = await db.transaction(async (tx) => {
      let rowId = id;
      if (id) await tx.update(suppliers).set({ ...values, updatedAt: new Date() }).where(eq(suppliers.id, id));
      else rowId = (await tx.insert(suppliers).values(values).returning({ id: suppliers.id }))[0].id;
      await audit(tx, {
        userId: user.id,
        action: id ? "update" : "create",
        entity: "supplier",
        entityId: rowId,
        summary: `${id ? "Edited" : "Added"} supplier ${data.name}`,
      });
      return rowId!;
    });
    expire(TAG.masters, TAG.purchases);
    return { ok: true, data: { id: savedId }, message: id ? `${data.name} saved` : `${data.name} added` };
  });
}
