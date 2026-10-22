import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { FormSkeleton, ListSkeleton } from "@/components/common/skeletons";
import { addDays } from "@/domain/dates";
import { getCurrentUser } from "@/lib/auth";
import { today } from "@/lib/today";
import { getSupplierStats } from "@/server/queries/inbound";
import { getMasters } from "@/server/queries/masters";
import { AddSupplierRow } from "./supplier-forms";
import { SupplierTable } from "./supplier-table";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage() {
  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who sends fly ash, cement and M sand. They appear in the supplier dropdown on the Inbound page."
        actions={
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/inbound">
              <Warehouse aria-hidden /> Inbound
            </Link>
          </Button>
        }
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <FormSkeleton />
            <ListSkeleton />
          </div>
        }
      >
        <Suppliers />
      </Suspense>
    </>
  );
}

async function Suppliers() {
  const [user, t, masters] = await Promise.all([getCurrentUser(), today(), getMasters()]);
  const isOwner = user.role === "owner";
  const stats = await getSupplierStats(addDays(t, -29));
  const list = masters.suppliers.filter((s) => isOwner || s.active);

  return (
    <div className="space-y-4">
      <AddSupplierRow isOwner={isOwner} />

      <SupplierTable
        today={t}
        isOwner={isOwner}
        rows={list.map((s) => {
          const st = stats.find((x) => x.supplierId === s.id);
          return {
            id: s.id,
            name: s.name,
            phone: s.phone,
            gstin: s.gstin,
            address: s.address,
            active: s.active,
            kg: st?.kg ?? 0,
            loads: st?.loads ?? 0,
            materials: st?.materials || null,
            last: st?.last ?? null,
          };
        })}
      />
    </div>
  );
}
