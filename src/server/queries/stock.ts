import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { materials, products, stockAdjustments, users } from "@/db/schema";
import { addDays } from "@/domain/dates";
import { num, round2 } from "@/domain/money";
import { daysOfStockLeft, finishedGoodsStock, rawMaterialStock } from "@/domain/stock";
import { getCurrentUser, requireOwner } from "@/lib/auth";
import { TAG } from "@/server/tags";

const STOCK_TAGS = [TAG.inbound, TAG.production, TAG.dispatch, TAG.stockAdj, TAG.masters] as const;

/**
 * Current stock as of `asOf` (inclusive):
 * - finished goods = produced − rejected − dispatched ± adjustments
 * - raw material  = received − (produced × mix kg) ± adjustments   (estimated)
 */
async function loadStock(asOf: string) {
  "use cache";
  cacheTag(...STOCK_TAGS);
  cacheLife("live");
  const weekAgo = addDays(asOf, -6);

  const [productRows, materialRows] = await Promise.all([
    db.execute<{
      id: number;
      name: string;
      code: string;
      daily_capacity: number;
      produced: string;
      rejected: string;
      dispatched: string;
      adjustment: string;
      produced_7d: string;
      dispatched_7d: string;
    }>(sql`
      select p.id, p.name, p.code, p.daily_capacity,
        coalesce((select sum(quantity_produced) from production_entries where product_id = p.id and deleted_at is null and entry_date <= ${asOf}), 0) as produced,
        coalesce((select sum(quantity_rejected) from production_entries where product_id = p.id and deleted_at is null and entry_date <= ${asOf}), 0) as rejected,
        coalesce((select sum(di.quantity) from dispatch_items di join dispatches d on d.id = di.dispatch_id
                  where di.product_id = p.id and d.deleted_at is null and d.dispatch_date <= ${asOf}), 0) as dispatched,
        coalesce((select sum(quantity) from stock_adjustments where product_id = p.id and deleted_at is null and adj_date <= ${asOf}), 0) as adjustment,
        coalesce((select sum(quantity_produced - quantity_rejected) from production_entries where product_id = p.id and deleted_at is null and entry_date between ${weekAgo} and ${asOf}), 0) as produced_7d,
        coalesce((select sum(di.quantity) from dispatch_items di join dispatches d on d.id = di.dispatch_id
                  where di.product_id = p.id and d.deleted_at is null and d.dispatch_date between ${weekAgo} and ${asOf}), 0) as dispatched_7d
      from products p where p.active order by p.sort_order, p.id`),
    db.execute<{
      id: number;
      name: string;
      code: string;
      low_stock_kg: string;
      inbound: string;
      consumed: string;
      adjustment: string;
      consumed_7d: string;
      inbound_7d: string;
    }>(sql`
      select m.id, m.name, m.code, m.low_stock_kg,
        coalesce((select sum(net_kg) from inbound_entries where material_id = m.id and deleted_at is null and entry_date <= ${asOf}), 0) as inbound,
        coalesce((select sum(pe.quantity_produced * r.kg_per_unit) from production_entries pe
                  join product_recipes r on r.product_id = pe.product_id and r.material_id = m.id
                  where pe.deleted_at is null and pe.entry_date <= ${asOf}), 0) as consumed,
        coalesce((select sum(quantity) from stock_adjustments where material_id = m.id and deleted_at is null and adj_date <= ${asOf}), 0) as adjustment,
        coalesce((select sum(pe.quantity_produced * r.kg_per_unit) from production_entries pe
                  join product_recipes r on r.product_id = pe.product_id and r.material_id = m.id
                  where pe.deleted_at is null and pe.entry_date between ${weekAgo} and ${asOf}), 0) as consumed_7d,
        coalesce((select sum(net_kg) from inbound_entries where material_id = m.id and deleted_at is null and entry_date between ${weekAgo} and ${asOf}), 0) as inbound_7d
      from materials m where m.active order by m.sort_order, m.id`),
  ]);

  const finished = productRows.map((r) => {
    const stock = finishedGoodsStock({
      produced: num(r.produced),
      rejected: num(r.rejected),
      dispatched: num(r.dispatched),
      adjustment: num(r.adjustment),
    });
    return {
      productId: r.id,
      name: r.name,
      code: r.code,
      dailyCapacity: r.daily_capacity,
      stock,
      produced7d: num(r.produced_7d),
      dispatched7d: num(r.dispatched_7d),
    };
  });

  const raw = materialRows.map((r) => {
    const stock = rawMaterialStock({ inbound: num(r.inbound), consumed: num(r.consumed), adjustment: num(r.adjustment) });
    const avgUse = round2(num(r.consumed_7d) / 7);
    return {
      materialId: r.id,
      name: r.name,
      code: r.code,
      lowStockKg: num(r.low_stock_kg),
      stockKg: stock,
      avgDailyUseKg: avgUse,
      daysLeft: daysOfStockLeft(stock, avgUse),
      inbound7dKg: num(r.inbound_7d),
      low: stock <= num(r.low_stock_kg),
    };
  });

  return { finished, raw };
}

export type StockSnapshot = Awaited<ReturnType<typeof loadStock>>;

/** Finished-goods stock is needed on the dispatch form, so employees may read it (no money involved). */
export async function getStock(asOf: string) {
  await getCurrentUser();
  return loadStock(asOf);
}

export async function stockUnchecked(asOf: string) {
  return loadStock(asOf);
}

async function loadAdjustments() {
  "use cache";
  cacheTag(TAG.stockAdj, TAG.masters);
  cacheLife("live");
  return db
    .select({
      id: stockAdjustments.id,
      adjDate: stockAdjustments.adjDate,
      itemType: stockAdjustments.itemType,
      materialName: materials.name,
      productName: products.name,
      quantity: stockAdjustments.quantity,
      reason: stockAdjustments.reason,
      createdByName: users.name,
      createdAt: stockAdjustments.createdAt,
    })
    .from(stockAdjustments)
    .leftJoin(materials, eq(materials.id, stockAdjustments.materialId))
    .leftJoin(products, eq(products.id, stockAdjustments.productId))
    .innerJoin(users, eq(users.id, stockAdjustments.createdBy))
    .where(and(isNull(stockAdjustments.deletedAt)))
    .orderBy(desc(stockAdjustments.adjDate), desc(stockAdjustments.id))
    .limit(100);
}

export async function getStockAdjustments() {
  await requireOwner();
  return loadAdjustments();
}
