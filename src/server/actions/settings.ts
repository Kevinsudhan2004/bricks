"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { companySettings, materials, productRecipes, products, users } from "@/db/schema";
import { actionUser } from "@/lib/auth";
import { destroyUserSessions, readSessionUser } from "@/lib/session";
import {
  changePasswordSchema,
  companySchema,
  materialSchema,
  password as passwordSchema,
  productSchema,
  recipeSchema,
  userCreateSchema,
  userUpdateSchema,
} from "@/lib/validators";
import { expire, parseInput, runAction, UserError, type ActionResult } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { TAG } from "@/server/tags";

const nullify = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === undefined ? null : v])) as {
    [K in keyof T]: Exclude<T[K], undefined> | null;
  };

export async function updateCompany(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(companySchema, input);
    await db.transaction(async (tx) => {
      await tx
        .insert(companySettings)
        .values({ id: 1, ...nullify(data), name: data.name, defaultDueDays: data.defaultDueDays })
        .onConflictDoUpdate({
          target: companySettings.id,
          set: { ...nullify(data), name: data.name, defaultDueDays: data.defaultDueDays, updatedAt: new Date() },
        });
      await audit(tx, { userId: user.id, action: "update", entity: "settings", summary: "Updated company profile", after: data });
    });
    expire(TAG.settings);
    return { ok: true, data: null, message: "Company profile saved" };
  });
}

export async function saveProduct(id: number | null, input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(productSchema, input);
    const [dupe] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.code, data.code), id ? ne(products.id, id) : undefined));
    if (dupe) throw new UserError("Another product already uses this code.", { code: "Code already used" });
    const values = { ...data, size: data.size ?? null, hsnCode: data.hsnCode ?? null };
    const savedId = await db.transaction(async (tx) => {
      let rowId = id;
      if (id) await tx.update(products).set({ ...values, updatedAt: new Date() }).where(eq(products.id, id));
      else rowId = (await tx.insert(products).values(values).returning({ id: products.id }))[0].id;
      await audit(tx, { userId: user.id, action: id ? "update" : "create", entity: "product", entityId: rowId, summary: `${id ? "Edited" : "Added"} product ${data.name}`, after: data });
      return rowId!;
    });
    expire(TAG.masters);
    return { ok: true, data: { id: savedId }, message: `${data.name} saved` };
  });
}

export async function saveMaterial(id: number | null, input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(materialSchema, input);
    const [dupe] = await db
      .select({ id: materials.id })
      .from(materials)
      .where(and(eq(materials.code, data.code), id ? ne(materials.id, id) : undefined));
    if (dupe) throw new UserError("Another material already uses this code.", { code: "Code already used" });
    const savedId = await db.transaction(async (tx) => {
      let rowId = id;
      if (id) await tx.update(materials).set({ ...data, updatedAt: new Date() }).where(eq(materials.id, id));
      else rowId = (await tx.insert(materials).values(data).returning({ id: materials.id }))[0].id;
      await audit(tx, { userId: user.id, action: id ? "update" : "create", entity: "material", entityId: rowId, summary: `${id ? "Edited" : "Added"} material ${data.name}`, after: data });
      return rowId!;
    });
    expire(TAG.masters);
    return { ok: true, data: { id: savedId }, message: `${data.name} saved` };
  });
}

export async function saveRecipe(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await actionUser(["owner"]);
    const data = parseInput(recipeSchema, input);
    await db.transaction(async (tx) => {
      await tx.delete(productRecipes).where(eq(productRecipes.productId, data.productId));
      const lines = data.lines.filter((l) => l.kgPerUnit > 0);
      if (lines.length) await tx.insert(productRecipes).values(lines.map((l) => ({ productId: data.productId, ...l })));
      await audit(tx, { userId: user.id, action: "update", entity: "recipe", entityId: data.productId, summary: "Updated brick mix", after: data });
    });
    expire(TAG.masters);
    return { ok: true, data: null, message: "Mix saved — raw material stock recalculated" };
  });
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

async function activeOwnerCount(excludeId?: number) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "owner"), eq(users.active, true), excludeId ? ne(users.id, excludeId) : undefined));
  return n;
}

export async function createUser(input: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const actor = await actionUser(["owner"]);
    const data = parseInput(userCreateSchema, input);
    const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.username, data.username));
    if (dupe) throw new UserError("This username is taken.", { username: "Username taken" });
    const hash = await bcrypt.hash(data.password, 10);
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({ name: data.name, username: data.username, phone: data.phone ?? null, role: data.role, passwordHash: hash })
        .returning({ id: users.id });
      await audit(tx, { userId: actor.id, action: "create", entity: "user", entityId: row.id, summary: `Added ${data.role} login @${data.username}` });
      return row.id;
    });
    expire(TAG.users);
    return { ok: true, data: { id }, message: `Login created for ${data.name}` };
  });
}

export async function updateUser(id: number, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await actionUser(["owner"]);
    const data = parseInput(userUpdateSchema, input);
    const [existing] = await db.select().from(users).where(eq(users.id, id));
    if (!existing) throw new UserError("User not found.");
    const losingOwner = existing.role === "owner" && existing.active && (data.role !== "owner" || !data.active);
    if (losingOwner && (await activeOwnerCount(id)) === 0) {
      throw new UserError("There must always be at least one active owner.");
    }
    if (id === actor.id && !data.active) throw new UserError("You can't disable your own login.");
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ name: data.name, phone: data.phone ?? null, role: data.role, active: data.active, updatedAt: new Date() })
        .where(eq(users.id, id));
      await audit(tx, { userId: actor.id, action: "update", entity: "user", entityId: id, summary: `Updated login @${existing.username}`, after: data });
    });
    // Role or access changed: sign them out everywhere so it takes effect now.
    if (!data.active || data.role !== existing.role) await destroyUserSessions(id);
    expire(TAG.users);
    return { ok: true, data: null, message: "User saved" };
  });
}

export async function resetUserPassword(id: number, newPassword: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await actionUser(["owner"]);
    const pw = parseInput(passwordSchema, newPassword);
    const [existing] = await db.select().from(users).where(eq(users.id, id));
    if (!existing) throw new UserError("User not found.");
    await db.update(users).set({ passwordHash: await bcrypt.hash(pw, 10), updatedAt: new Date() }).where(eq(users.id, id));
    if (id !== actor.id) await destroyUserSessions(id);
    await db.transaction((tx) =>
      audit(tx, { userId: actor.id, action: "update", entity: "user", entityId: id, summary: `Reset password for @${existing.username}` }),
    );
    return { ok: true, data: null, message: `Password reset for ${existing.name}` };
  });
}

export async function changeOwnPassword(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const me = await readSessionUser();
    if (!me) throw new UserError("Please sign in again.");
    const data = parseInput(changePasswordSchema, input);
    const [row] = await db.select().from(users).where(eq(users.id, me.id));
    if (!row || !(await bcrypt.compare(data.current, row.passwordHash))) {
      throw new UserError("Current password is wrong.", { current: "Current password is wrong" });
    }
    await db.update(users).set({ passwordHash: await bcrypt.hash(data.next, 10), updatedAt: new Date() }).where(eq(users.id, me.id));
    await db.transaction((tx) => audit(tx, { userId: me.id, action: "update", entity: "user", entityId: me.id, summary: "Changed own password" }));
    return { ok: true, data: null, message: "Password changed" };
  });
}
