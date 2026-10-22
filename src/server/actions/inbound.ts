"use server";

import { and, eq, ilike, isNull } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { inboundEntries, materials, suppliers } from "@/db/schema";
import { round2 } from "@/domain/money";
import { actionUser } from "@/lib/auth";
import { formatWeight } from "@/lib/format";
import { deleteSchema, inboundSchema, type InboundData } from "@/lib/validators";
import { expire, parseInput, runAction, UserError, type ActionResult } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { assertCanModifyEntry, assertEntryDate } from "@/server/permissions";
import { TAG } from "@/server/tags";

/** Use the chosen supplier, or find/create one from a typed name. */
async function resolveSupplier(tx: Tx, data: InboundData): Promise<{ id: number | null; created: boolean }> {
  if (data.supplierId) return { id: data.supplierId, created: false };
  const name = data.newSupplierName?.trim();
  if (!name) return { id: null, created: false };
  const [existing] = await tx.select({ id: suppliers.id }).from(suppliers).where(ilike(suppliers.name, name)).limit(1);
  if (existing) return { id: existing.id, created: false };
  const [created] = await tx.insert(suppliers).values({ name }).returning({ id: suppliers.id });
  return { id: created.id, created: true };
}

async function materialOrThrow(id: number) {
  const [material] = await db.select().from(materials).where(eq(materials.id, id));
  if (!material) throw new UserError("Pick a material.", { materialId: "Pick a material" });
  return material;
}

export async function createInbound(input: unknown): Promise<ActionResult<{ id: number; summary: string }>> {
  return runAction(async () => {
    const user = await actionUser();
    const data = parseInput(inboundSchema, input);
    assertEntryDate(user, data.entryDate);
    const material = await materialOrThrow(data.materialId);
    const netKg = round2(data.netKg);

    const result = await db.transaction(async (tx) => {
      const supplier = await resolveSupplier(tx, data);
      const [created] = await tx
        .insert(inboundEntries)
        .values({ entryDate: data.entryDate, materialId: data.materialId, supplierId: supplier.id, netKg, createdBy: user.id })
        .returning({ id: inboundEntries.id });
      const summary = `${formatWeight(netKg)} ${material.name}`;
      await audit(tx, {
        userId: user.id,
        action: "create",
        entity: "inbound",
        entityId: created.id,
        summary: `Inbound ${summary}`,
        after: { ...data, supplierId: supplier.id },
      });
      return { id: created.id, summary, newSupplier: supplier.created };
    });

    expire(TAG.inbound, ...(result.newSupplier ? [TAG.masters] : []));
    return { ok: true, data: { id: result.id, summary: result.summary }, message: `Saved ${result.summary}` };
  });
}

export async function updateInbound(id: number, input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const user = await actionUser();
    const data = parseInput(inboundSchema, input);
    const [existing] = await db
      .select()
      .from(inboundEntries)
      .where(and(eq(inboundEntries.id, id), isNull(inboundEntries.deletedAt)));
    if (!existing) throw new UserError("This entry no longer exists.");
    assertCanModifyEntry(user, existing);
    assertEntryDate(user, data.entryDate);
    await materialOrThrow(data.materialId);
    const netKg = round2(data.netKg);
    const weightChanged = netKg !== existing.netKg;

    let newSupplier = false;
    await db.transaction(async (tx) => {
      const supplier = await resolveSupplier(tx, data);
      newSupplier = supplier.created;
      await tx
        .update(inboundEntries)
        .set({
          entryDate: data.entryDate,
          materialId: data.materialId,
          supplierId: supplier.id,
          netKg,
          // Old weighbridge details no longer match a corrected weight.
          ...(weightChanged ? { grossKg: null, tareKg: null } : {}),
          // Keep any rate the owner set earlier; just recompute the amount.
          amount: existing.ratePerTon !== null ? round2((netKg / 1000) * existing.ratePerTon) : null,
          updatedAt: new Date(),
        })
        .where(eq(inboundEntries.id, id));
      await audit(tx, {
        userId: user.id,
        action: "update",
        entity: "inbound",
        entityId: id,
        summary: `Edited inbound #${id}`,
        before: existing,
        after: { ...data, supplierId: supplier.id },
      });
    });
    expire(TAG.inbound, ...(newSupplier ? [TAG.masters] : []));
    return { ok: true, data: { id }, message: "Entry updated" };
  });
}

export async function deleteInbound(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser();
    const { id, reason } = parseInput(deleteSchema, input);
    const [existing] = await db
      .select()
      .from(inboundEntries)
      .where(and(eq(inboundEntries.id, id), isNull(inboundEntries.deletedAt)));
    if (!existing) throw new UserError("This entry was already deleted.");
    assertCanModifyEntry(user, existing);
    await db.transaction(async (tx) => {
      await tx
        .update(inboundEntries)
        .set({ deletedAt: new Date(), deleteReason: reason })
        .where(eq(inboundEntries.id, id));
      await audit(tx, {
        userId: user.id,
        action: "delete",
        entity: "inbound",
        entityId: id,
        summary: `Deleted inbound #${id}: ${reason}`,
        before: existing,
      });
    });
    expire(TAG.inbound);
    return { ok: true, data: null, message: "Entry deleted" };
  });
}
