import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton } from "@/components/common/skeletons";
import { requireOwner } from "@/lib/auth";
import { getFleetLive } from "@/server/queries/trucks";
import { FleetLive } from "./fleet-live";

export const metadata: Metadata = { title: "Truck location" };

export default function TrucksPage() {
  return (
    <>
      <PageHeader title="Truck location" description="Live position, speed and today's distance for every truck, from the driver's phone app." />
      <Suspense fallback={<FleetSkeleton />}>
        <Fleet />
      </Suspense>
    </>
  );
}

function FleetSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-full max-w-lg rounded-full" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <Skeleton className="h-[52dvh] min-h-80 rounded-xl lg:h-[calc(100dvh-12rem)]" />
        <ListSkeleton rows={4} />
      </div>
    </div>
  );
}

async function Fleet() {
  await requireOwner();
  return <FleetLive initial={await getFleetLive()} />;
}
