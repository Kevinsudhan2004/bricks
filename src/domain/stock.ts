import { round2 } from "./money";

export function finishedGoodsStock(x: {
  produced: number;
  rejected: number;
  dispatched: number;
  adjustment: number;
}): number {
  return x.produced - x.rejected - x.dispatched + x.adjustment;
}

/** Raw material used = Σ (bricks produced, including rejects) × kg per brick from the mix. */
export function materialConsumption(
  producedByProduct: { productId: number; quantity: number }[],
  recipe: { productId: number; kgPerUnit: number }[],
): number {
  const perUnit = new Map(recipe.map((r) => [r.productId, r.kgPerUnit]));
  return round2(producedByProduct.reduce((acc, p) => acc + p.quantity * (perUnit.get(p.productId) ?? 0), 0));
}

export function rawMaterialStock(x: { inbound: number; consumed: number; adjustment: number }): number {
  return round2(x.inbound - x.consumed + x.adjustment);
}

/** Days the current stock will last at the recent average daily usage; null when there's no usage. */
export function daysOfStockLeft(stock: number, avgDailyUse: number): number | null {
  if (avgDailyUse <= 0) return null;
  return Math.max(0, Math.floor(stock / avgDailyUse));
}
