import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { FileMinus, FilePlus, FileStack, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/page-header";
import { RangeFilter } from "@/components/common/range-filter";
import { ListSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { StatCard } from "@/components/common/stat-card";
import { requireOwner } from "@/lib/auth";
import { resolveRange } from "@/lib/date-range";
import { formatINRCompact } from "@/lib/format";
import { flatParams, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { getSupplierNotes, getSupplierPayments } from "@/server/queries/purchases";
import { SupplierNoteTable, SupplierPaymentTable } from "./supplier-money-tables";

export const metadata: Metadata = { title: "Payments to suppliers" };

export default function SupplierPaymentsPage({ searchParams }: PageProps<"/purchases/payments">) {
  return (
    <>
      <PageHeader
        title="Payments to suppliers"
        description="Every rupee paid for raw material, plus the credits and extra charges suppliers put on their accounts."
        actions={
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/purchases">
              <FileStack aria-hidden /> Raw material bills
            </Link>
          </Button>
        }
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <StatGridSkeleton />
            <ListSkeleton />
          </div>
        }
      >
        <SupplierPaymentsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SupplierPaymentsContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const [sp, t] = await Promise.all([searchParams, today()]);
  const range = resolveRange(sp, t, "month");
  const [payments, notes] = await Promise.all([getSupplierPayments(range.from, range.to), getSupplierNotes(range.from, range.to)]);
  const paid = payments.reduce((a, r) => a + r.amount, 0);
  const credits = notes.filter((n) => n.type === "credit").reduce((a, n) => a + n.amount, 0);
  const extra = notes.filter((n) => n.type === "debit").reduce((a, n) => a + n.amount, 0);
  const advances = payments.filter((p) => !p.billId).reduce((a, p) => a + p.amount, 0);

  return (
    <div className="space-y-4">
      <RangeFilter pathname="/purchases/payments" params={flatParams(sp)} preset={range.preset} from={range.from} to={range.to} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Paid · ${range.label}`} value={formatINRCompact(paid)} hint={`${payments.length} payments`} icon={HandCoins} tone="primary" />
        <StatCard label="Advances / on account" value={formatINRCompact(advances)} hint="Not tied to a bill" icon={HandCoins} />
        <StatCard label="Credits from suppliers" value={formatINRCompact(credits)} hint="Reduced what you owe" icon={FileMinus} tone="success" />
        <StatCard label="Extra charges" value={formatINRCompact(extra)} hint="Added to what you owe" icon={FilePlus} tone="warning" />
      </div>
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="notes">Credits & extra charges ({notes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-3">
          <SupplierPaymentTable rows={payments} today={t} />
        </TabsContent>
        <TabsContent value="notes" className="mt-3">
          <SupplierNoteTable rows={notes} today={t} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
