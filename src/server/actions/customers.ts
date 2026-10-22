"use server";

import { and, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { actionUser } from "@/lib/auth";
import { customerSchema } from "@/lib/validators";
import { expire, parseInput, runAction, UserError, type ActionResult } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { TAG } from "@/server/tags";

function toRow(data: ReturnType<typeof customerSchema.parse>) {
  return {
    name: data.name,
    firmName: data.firmName ?? null,
    phone: data.phone ?? null,
    altPhone: data.altPhone ?? null,
    gstin: data.gstin ?? null,
    billingAddress: data.billingAddress ?? null,
    siteAddress: data.siteAddress ?? null,
    stateName: data.stateName ?? null,
    openingBalance: data.openingBalance ?? 0,
    notes: data.notes ?? null,
  };
}

export async function createCustomer(input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const user = await actionUser();
    const data = parseInput(customerSchema, input);
    const [dupe] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(ilike(customers.name, data.name), data.phone ? eq(customers.phone, data.phone) : undefined))
      .limit(1);
    if (dupe && data.phone) throw new UserError("This customer is already added (same name and phone).", { name: "Already added" });
    const row = toRow(data);
    // Opening balance is money: only the owner can set it.
    if (user.role !== "owner") row.openingBalance = 0;
    const id = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(customers)
        .values({ ...row, createdBy: user.id })
        .returning({ id: customers.id });
      await audit(tx, { userId: user.id, action: "create", entity: "customer", entityId: created.id, summary: `Added customer ${data.name}` });
      return created.id;
    });
    expire(TAG.customers);
    return { ok: true, data: { id }, message: `Added ${data.name}` };
  });
}

export async function updateCustomer(id: number, input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const user = await actionUser();
    const data = parseInput(customerSchema, input);
    const [existing] = await db.select().from(customers).where(eq(customers.id, id));
    if (!existing) throw new UserError("Customer not found.");
    const row = toRow(data);
    if (user.role !== "owner") {
      // Employees edit contact details only; balance and private notes stay as the owner set them.
      row.openingBalance = existing.openingBalance;
      row.notes = existing.notes;
    }
    await db.transaction(async (tx) => {
      await tx.update(customers).set({ ...row, updatedAt: new Date() }).where(eq(customers.id, id));
      await audit(tx, {
        userId: user.id,
        action: "update",
        entity: "customer",
        entityId: id,
        summary: `Edited customer ${data.name}`,
        before: existing,
        after: data,
      });
    });
    expire(TAG.customers);
    return { ok: true, data: { id }, message: "Customer saved" };
  });
}

export async function setCustomerActive(id: number, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const [existing] = await db.select().from(customers).where(eq(customers.id, id));
    if (!existing) throw new UserError("Customer not found.");
    await db.transaction(async (tx) => {
      await tx.update(customers).set({ active, updatedAt: new Date() }).where(eq(customers.id, id));
      await audit(tx, {
        userId: user.id,
        action: "update",
        entity: "customer",
        entityId: id,
        summary: `${active ? "Re-activated" : "Archived"} customer ${existing.name}`,
      });
    });
    expire(TAG.customers);
    return { ok: true, data: null, message: active ? "Customer re-activated" : "Customer archived" };
  });
}
