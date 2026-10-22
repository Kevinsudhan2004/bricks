"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { truckDevices, trucks } from "@/db/schema";
import { actionUser } from "@/lib/auth";
import { truckSchema } from "@/lib/validators";
import { expire, parseInput, runAction, UserError, type ActionResult } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { TAG } from "@/server/tags";
import { newPairCode, PAIR_CODE_HOURS } from "@/server/tracking";

/** Owner only: add or edit a truck (name, number plate, driver). */
export async function saveTruck(id: number | null, input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(truckSchema, input);
    const values = {
      name: data.name,
      plateNo: data.plateNo ?? null,
      driverName: data.driverName ?? null,
      driverPhone: data.driverPhone ?? null,
      active: data.active,
    };

    const saved = await db.transaction(async (tx) => {
      if (id === null) {
        const [row] = await tx
          .insert(trucks)
          .values({ ...values, createdBy: user.id })
          .returning({ id: trucks.id });
        await audit(tx, { userId: user.id, action: "create", entity: "truck", entityId: row.id, summary: `Added truck ${data.name}`, after: data });
        return row.id;
      }
      const [before] = await tx.select().from(trucks).where(eq(trucks.id, id));
      if (!before) throw new UserError("This truck no longer exists.");
      await tx
        .update(trucks)
        .set({ ...values, ...(data.active ? {} : { pairCode: null, pairCodeExpiresAt: null }), updatedAt: new Date() })
        .where(eq(trucks.id, id));
      await audit(tx, {
        userId: user.id,
        action: "update",
        entity: "truck",
        entityId: id,
        summary: `Edited truck ${data.name}${before.active && !data.active ? " (hidden)" : ""}`,
        before,
        after: data,
      });
      return id;
    });
    expire(TAG.trucks);
    return { ok: true, data: { id: saved }, message: id === null ? `${data.name} added` : "Truck saved" };
  });
}

/** Owner only: make a fresh one-time code the driver types into the phone app. */
export async function makePairCode(truckId: number): Promise<ActionResult<{ code: string; expiresAt: number }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const [truck] = await db.select().from(trucks).where(eq(trucks.id, truckId));
    if (!truck) throw new UserError("This truck no longer exists.");
    if (!truck.active) throw new UserError("Show this truck again before linking a phone.");

    const expiresAt = new Date(Date.now() + PAIR_CODE_HOURS * 3_600_000);
    // The column is unique; retry on the (very unlikely) clash with another truck's code.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newPairCode();
      try {
        await db.transaction(async (tx) => {
          await tx.update(trucks).set({ pairCode: code, pairCodeExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(trucks.id, truckId));
          await audit(tx, { userId: user.id, action: "create", entity: "truck", entityId: truckId, summary: `New phone link code for ${truck.name}` });
        });
        expire(TAG.trucks);
        return { ok: true, data: { code, expiresAt: expiresAt.getTime() } };
      } catch (err) {
        if (!(err instanceof Error && /unique|duplicate/i.test(err.message + String((err as { cause?: unknown }).cause)))) throw err;
      }
    }
    throw new UserError("Couldn't make a code. Please try again.");
  });
}

/** Owner only: disconnect the driver phone (lost phone, driver changed). The app stops uploading at once. */
export async function unlinkTruckPhone(truckId: number): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const [truck] = await db.select().from(trucks).where(eq(trucks.id, truckId));
    if (!truck) throw new UserError("This truck no longer exists.");
    await db.transaction(async (tx) => {
      const revoked = await tx
        .update(truckDevices)
        .set({ revokedAt: new Date() })
        .where(and(eq(truckDevices.truckId, truckId), isNull(truckDevices.revokedAt)))
        .returning({ id: truckDevices.id });
      if (revoked.length === 0) throw new UserError("No phone is linked to this truck.");
      await tx.update(trucks).set({ currentTripId: null, updatedAt: new Date() }).where(eq(trucks.id, truckId));
      await audit(tx, { userId: user.id, action: "unlink", entity: "truck", entityId: truckId, summary: `Unlinked the driver phone from ${truck.name}` });
    });
    expire(TAG.trucks);
    return { ok: true, data: null, message: "Phone unlinked" };
  });
}
