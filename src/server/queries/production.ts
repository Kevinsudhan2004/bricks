import "server-only";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { productionEntries, products, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { TAG } from "@/server/tags";

async function loadProduction(from: string, to: string, productId: number | null) {
  "use cache";
  cacheTag(TAG.production, TAG.masters);
  cacheLife("live");
  const where = and(
    isNull(productionEntries.deletedAt),
    gte(productionEntries.entryDate, from),
    lte(productionEntries.entryDate, to),
    productId ? eq(productionEntries.productId, productId) : undefined,
  );
  const [rows, totals, days] = await Promise.all([
    db
      .select({
        id: productionEntries.id,
        entryDate: productionEntries.entryDate,
        productId: productionEntries.productId,
        productName: products.name,
        productCode: products.code,
        shift: productionEntries.shift,
        quantityProduced: productionEntries.quantityProduced,
        quantityRejected: productionEntries.quantityRejected,
        remarks: productionEntries.remarks,
        createdBy: productionEntries.createdBy,
        createdByName: users.name,
        createdAt: productionEntries.createdAt,
      })
      .from(productionEntries)
      .innerJoin(products, eq(products.id, productionEntries.productId))
      .innerJoin(users, eq(users.id, productionEntries.createdBy))
      .where(where)
      .orderBy(desc(productionEntries.entryDate), desc(productionEntries.createdAt))
      .limit(500),
    db
      .select({
        productId: productionEntries.productId,
        produced: sql<number>`coalesce(sum(${productionEntries.quantityProduced}), 0)::int`,
        rejected: sql<number>`coalesce(sum(${productionEntries.quantityRejected}), 0)::int`,
        days: sql<number>`count(distinct ${productionEntries.entryDate})::int`,
      })
      .from(productionEntries)
      .where(where)
      .groupBy(productionEntries.productId),
    db
      .select({
        date: productionEntries.entryDate,
        productId: productionEntries.productId,
        produced: sql<number>`sum(${productionEntries.quantityProduced})::int`,
        rejected: sql<number>`sum(${productionEntries.quantityRejected})::int`,
      })
      .from(productionEntries)
      .where(where)
      .groupBy(productionEntries.entryDate, productionEntries.productId)
      .orderBy(desc(productionEntries.entryDate)),
  ]);
  return { rows, totals, days };
}

export type ProductionRow = Awaited<ReturnType<typeof loadProduction>>["rows"][number];

export async function getProductionList(from: string, to: string, productId: number | null) {
  await getCurrentUser();
  return loadProduction(from, to, productId);
}

/** Totals already recorded for one day, per product (shown on the entry form). */
export async function getProductionForDay(date: string) {
  await getCurrentUser();
  const { totals } = await loadProduction(date, date, null);
  return totals;
}

async function loadProductionEntry(id: number) {
  "use cache";
  cacheTag(TAG.production);
  cacheLife("live");
  const [row] = await db
    .select()
    .from(productionEntries)
    .where(and(eq(productionEntries.id, id), isNull(productionEntries.deletedAt)));
  return row ?? null;
}

export async function getProductionEntry(id: number) {
  await getCurrentUser();
  return loadProductionEntry(id);
}
