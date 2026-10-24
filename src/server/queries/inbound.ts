import "server-only";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { inboundEntries, materials, purchaseBills, suppliers, users } from "@/db/schema";
import { getCurrentUser, requireOwner } from "@/lib/auth";
import { TAG } from "@/server/tags";

const LIST_LIMIT = 500;

async function loadInbound(from: string, to: string, materialId: number | null) {
  "use cache";
  cacheTag(TAG.inbound, TAG.masters, TAG.purchases);
  cacheLife("live");
  const where = and(
    isNull(inboundEntries.deletedAt),
    gte(inboundEntries.entryDate, from),
    lte(inboundEntries.entryDate, to),
    materialId ? eq(inboundEntries.materialId, materialId) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: inboundEntries.id,
        entryDate: inboundEntries.entryDate,
        materialId: inboundEntries.materialId,
        materialName: materials.name,
        materialCode: materials.code,
        supplierId: inboundEntries.supplierId,
        supplierName: suppliers.name,
        vehicleNo: inboundEntries.vehicleNo,
        challanNo: inboundEntries.challanNo,
        grossKg: inboundEntries.grossKg,
        tareKg: inboundEntries.tareKg,
        netKg: inboundEntries.netKg,
        ratePerTon: inboundEntries.ratePerTon,
        amount: inboundEntries.amount,
        purchaseBillId: inboundEntries.purchaseBillId,
        billNo: purchaseBills.billNo,
        remarks: inboundEntries.remarks,
        createdBy: inboundEntries.createdBy,
        createdByName: users.name,
        createdAt: inboundEntries.createdAt,
      })
      .from(inboundEntries)
      .innerJoin(materials, eq(materials.id, inboundEntries.materialId))
      .leftJoin(suppliers, eq(suppliers.id, inboundEntries.supplierId))
      .leftJoin(purchaseBills, eq(purchaseBills.id, inboundEntries.purchaseBillId))
      .innerJoin(users, eq(users.id, inboundEntries.createdBy))
      .where(where)
      .orderBy(desc(inboundEntries.entryDate), desc(inboundEntries.createdAt))
      .limit(LIST_LIMIT),
    db
      .select({
        materialId: inboundEntries.materialId,
        loads: sql<number>`count(*)::int`,
        netKg: sql<number>`coalesce(sum(${inboundEntries.netKg}), 0)::float8`,
        amount: sql<number>`coalesce(sum(${inboundEntries.amount}), 0)::float8`,
      })
      .from(inboundEntries)
      .where(where)
      .groupBy(inboundEntries.materialId),
  ]);
  return { rows, totals, truncated: rows.length >= LIST_LIMIT };
}

export type InboundRow = Awaited<ReturnType<typeof loadInbound>>["rows"][number];

/** Inbound list. Employees get the same rows with money fields removed. */
export async function getInboundList(from: string, to: string, materialId: number | null) {
  const user = await getCurrentUser();
  const data = await loadInbound(from, to, materialId);
  if (user.role === "owner") return data;
  return {
    ...data,
    rows: data.rows.map((r) => ({ ...r, ratePerTon: null, amount: null, billNo: null })),
    totals: data.totals.map((t) => ({ ...t, amount: 0 })),
  };
}

async function loadInboundEntry(id: number) {
  "use cache";
  cacheTag(TAG.inbound);
  cacheLife("live");
  const [row] = await db.select().from(inboundEntries).where(and(eq(inboundEntries.id, id), isNull(inboundEntries.deletedAt)));
  return row ?? null;
}

export async function getInboundEntry(id: number) {
  const user = await getCurrentUser();
  const row = await loadInboundEntry(id);
  if (!row) return null;
  return user.role === "owner" ? row : { ...row, ratePerTon: null, amount: null };
}

async function loadVehicleSuggestions() {
  "use cache";
  cacheTag(TAG.inbound, TAG.dispatch);
  cacheLife("live");
  const rows = await db.execute<{ vehicle_no: string }>(sql`
    select vehicle_no from (
      select vehicle_no, max(created_at) as last from inbound_entries where vehicle_no is not null and deleted_at is null group by vehicle_no
      union all
      select vehicle_no, max(created_at) as last from dispatches where vehicle_no is not null and deleted_at is null group by vehicle_no
    ) v group by vehicle_no order by max(last) desc limit 60`);
  return rows.map((r) => r.vehicle_no);
}

export async function getVehicleSuggestions() {
  await getCurrentUser();
  return loadVehicleSuggestions();
}

export async function getInboundForExport(from: string, to: string) {
  await requireOwner();
  return loadInbound(from, to, null);
}

async function loadSupplierStats(from: string) {
  "use cache";
  cacheTag(TAG.inbound, TAG.masters);
  cacheLife("live");
  const rows = await db.execute<{ supplier_id: number; loads: number; kg: string; last: string | null; materials: string | null }>(sql`
    select i.supplier_id, count(*)::int as loads, sum(i.net_kg) as kg, max(i.entry_date)::text as last,
      string_agg(distinct m.name, ', ') as materials
    from inbound_entries i join materials m on m.id = i.material_id
    where i.deleted_at is null and i.supplier_id is not null and i.entry_date >= ${from}
    group by i.supplier_id`);
  return rows.map((r) => ({ supplierId: r.supplier_id, loads: r.loads, kg: Number(r.kg) || 0, last: r.last, materials: r.materials }));
}

/** Loads and tonnes per supplier since `from` (shown on the Suppliers page). */
export async function getSupplierStats(from: string) {
  await getCurrentUser();
  return loadSupplierStats(from);
}
