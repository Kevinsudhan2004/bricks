import type { Metadata } from "next";
import { Suspense } from "react";
import { Info } from "lucide-react";
import { ListSkeleton } from "@/components/common/skeletons";
import { Pill } from "@/components/common/status-badge";
import { requireOwner } from "@/lib/auth";
import { productColor } from "@/lib/colors";
import { formatINR, formatNumber } from "@/lib/format";
import { getMasters } from "@/server/queries/masters";
import { ProductEditor, RecipeEditor } from "../editors";

export const metadata: Metadata = { title: "Products · Settings" };

export default function ProductsSettingsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={2} />}>
      <Products />
    </Suspense>
  );
}

async function Products() {
  await requireOwner();
  const m = await getMasters();
  const activeMaterials = m.materials.filter((x) => x.active);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          The mix (kg of material per brick) is used to estimate raw-material stock. Please confirm GST rates and HSN codes with your accountant.
        </p>
        <ProductEditor />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {m.products.map((p, i) => {
          const mix = Object.fromEntries(m.recipes.filter((r) => r.productId === p.id).map((r) => [r.materialId, r.kgPerUnit]));
          return (
            <section key={p.id} className="overflow-hidden rounded-xl border bg-card">
              <div className="h-1" style={{ background: productColor(p.code, i) }} aria-hidden />
              <div className="p-4 md:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold">
                      {p.name} {!p.active && <Pill>Inactive</Pill>}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {p.code}
                      {p.size ? ` · ${p.size}` : ""}
                    </p>
                  </div>
                  <ProductEditor
                    id={p.id}
                    initial={{
                      name: p.name,
                      code: p.code,
                      size: p.size ?? "",
                      dailyCapacity: p.dailyCapacity,
                      defaultRate: p.defaultRate,
                      hsnCode: p.hsnCode ?? "",
                      gstRate: p.gstRate,
                      sortOrder: p.sortOrder,
                      active: p.active,
                    }}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Capacity / day</dt>
                    <dd className="num font-medium">{formatNumber(p.dailyCapacity)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Default rate</dt>
                    <dd className="num font-medium">{formatINR(p.defaultRate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">GST · HSN</dt>
                    <dd className="num font-medium">
                      {p.gstRate}% · {p.hsnCode ?? "—"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 border-t pt-4">
                  <h3 className="mb-2 text-sm font-medium">Mix per piece</h3>
                  <RecipeEditor productId={p.id} productName={p.name} materials={activeMaterials} initial={mix} />
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
