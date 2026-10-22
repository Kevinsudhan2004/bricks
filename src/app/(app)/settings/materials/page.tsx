import type { Metadata } from "next";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/skeletons";
import { Pill } from "@/components/common/status-badge";
import { requireOwner } from "@/lib/auth";
import { materialColor } from "@/lib/colors";
import { formatTonnes } from "@/lib/format";
import { getMasters } from "@/server/queries/masters";
import { MaterialEditor } from "../editors";

export const metadata: Metadata = { title: "Materials · Settings" };

export default function MaterialsSettingsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <Materials />
    </Suspense>
  );
}

async function Materials() {
  await requireOwner();
  const m = await getMasters();
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <MaterialEditor />
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {m.materials.map((x, i) => (
          <li key={x.id} className="flex items-center gap-3 p-4">
            <span className="size-3 rounded-[3px]" style={{ background: materialColor(x.code, i) }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                {x.name} {!x.active && <Pill>Inactive</Pill>}
              </p>
              <p className="text-xs text-muted-foreground">
                {x.code} · reorder below {formatTonnes(x.lowStockKg)}
              </p>
            </div>
            <MaterialEditor
              id={x.id}
              initial={{ name: x.name, code: x.code, lowStockKg: x.lowStockKg, sortOrder: x.sortOrder, active: x.active }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
