import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { FormSkeleton } from "@/components/common/skeletons";
import { requireOwner } from "@/lib/auth";
import { today } from "@/lib/today";
import { getActiveMasters } from "@/server/queries/masters";
import { getStock } from "@/server/queries/stock";
import { AdjustForm } from "./adjust-form";

export const metadata: Metadata = { title: "Adjust stock" };

export default function AdjustStockPage() {
  return (
    <>
      <PageHeader
        title="Adjust stock"
        description="Correct the numbers after a physical count, or record bricks broken in the yard."
        backHref="/stock"
        backLabel="Stock"
        className="mx-auto max-w-2xl"
      />
      <Suspense fallback={<FormSkeleton />}>
        <Adjust />
      </Suspense>
    </>
  );
}

async function Adjust() {
  await requireOwner();
  const t = await today();
  const [masters, stock] = await Promise.all([getActiveMasters(), getStock(t)]);
  return (
    <AdjustForm
      today={t}
      materials={masters.materials.map((m) => ({ id: m.id, name: m.name, current: stock.raw.find((r) => r.materialId === m.id)?.stockKg ?? 0 }))}
      products={masters.products.map((p) => ({ id: p.id, name: p.name, current: stock.finished.find((r) => r.productId === p.id)?.stock ?? 0 }))}
    />
  );
}
