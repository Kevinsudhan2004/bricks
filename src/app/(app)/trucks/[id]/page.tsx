import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Download, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/page-header";
import { StatGridSkeleton } from "@/components/common/skeletons";
import { addDays, isValidIsoDate } from "@/domain/dates";
import { requireOwner } from "@/lib/auth";
import { today } from "@/lib/today";
import { getTruckDay, getTruckDays } from "@/server/queries/trucks";
import { DayPicker, TruckDay } from "./truck-day";

export const metadata: Metadata = { title: "Truck history" };

export default function TruckHistoryPage({ params, searchParams }: PageProps<"/trucks/[id]">) {
  return (
    <Suspense fallback={<HistorySkeleton />}>
      <TruckHistory params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-12 w-full max-w-2xl" />
      <StatGridSkeleton count={6} />
      <Skeleton className="h-[55dvh] min-h-80 rounded-xl" />
    </div>
  );
}

async function TruckHistory({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwner();
  const [{ id: raw }, sp, t] = await Promise.all([params, searchParams, today()]);
  const id = Number(raw);
  if (!Number.isInteger(id)) notFound();
  const asked = typeof sp.date === "string" ? sp.date : "";
  const date = isValidIsoDate(asked) && asked <= t ? asked : t;

  const [day, days] = await Promise.all([getTruckDay(id, date), getTruckDays(id)]);
  if (!day) notFound();
  const { truck } = day;

  return (
    <>
      <PageHeader
        backHref="/trucks"
        backLabel="Truck location"
        title={
          <span className="flex flex-wrap items-baseline gap-x-3">
            {truck.name}
            {truck.plateNo && <span className="font-mono text-base font-medium text-muted-foreground">{truck.plateNo}</span>}
          </span>
        }
        description={truck.driverName ? `Driver: ${truck.driverName}` : "Route, speed and stops for the day."}
        actions={
          <>
            {truck.driverPhone && (
              <Button asChild variant="outline" className="flex-1 sm:flex-none">
                <a href={`tel:${truck.driverPhone}`}>
                  <Phone aria-hidden /> Call driver
                </a>
              </Button>
            )}
            {day.points.length > 0 && (
              <Button asChild variant="outline" className="flex-1 sm:flex-none">
                <a href={`/api/trucks/${id}/day?date=${date}&format=csv`} download>
                  <Download aria-hidden /> Download CSV
                </a>
              </Button>
            )}
          </>
        }
      />
      <DayPicker truckId={id} date={date} today={t} yesterday={addDays(t, -1)} days={days} />
      <TruckDay key={date} initial={day} isToday={date === t} />
    </>
  );
}
