import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { RangeFilter } from "@/components/common/range-filter";
import { FormSkeleton, ListSkeleton } from "@/components/common/skeletons";
import { addDays } from "@/domain/dates";
import { getCurrentUser } from "@/lib/auth";
import { productColor } from "@/lib/colors";
import { resolveRange } from "@/lib/date-range";
import { formatNumber } from "@/lib/format";
import { flatParams, intParam, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { canModifyEntry } from "@/server/permissions";
import { getDispatchList, type DispatchRow } from "@/server/queries/dispatch";
import { getVehicleSuggestions } from "@/server/queries/inbound";
import { getAllOpenInvoices, type OpenInvoice } from "@/server/queries/invoices";
import { getActiveMasters, getCustomerOptions } from "@/server/queries/masters";
import { getStock } from "@/server/queries/stock";
import { DispatchEditButton, DispatchQuickEntry, type DispatchOrder } from "./dispatch-entry";
import { DispatchTable } from "./dispatch-table";

export const metadata: Metadata = { title: "Dispatch" };

export default function DispatchPage({ searchParams }: PageProps<"/dispatch">) {
  return (
    <>
      <PageHeader title="Dispatch" description="Trucks leaving the factory. Pick the order number and type the bricks loaded." />
      <Suspense
        fallback={
          <div className="space-y-4">
            <FormSkeleton />
            <ListSkeleton />
          </div>
        }
      >
        <DispatchContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** Products the edit pop-up offers, with max = still pending on the invoice + what this truck carries. */
function editLines(row: DispatchRow, open: OpenInvoice[] | undefined) {
  const inv = open?.find((i) => i.id === row.invoiceId);
  const map = new Map<number, { productId: number; productName: string; productCode: string; max: number }>();
  for (const p of inv?.products ?? []) {
    if (p.pending > 0) map.set(p.productId, { productId: p.productId, productName: p.productName, productCode: p.productCode, max: p.pending });
  }
  for (const it of row.items) {
    const cur = map.get(it.productId);
    map.set(it.productId, {
      productId: it.productId,
      productName: it.name,
      productCode: it.code,
      max: (cur?.max ?? 0) + it.quantity,
    });
  }
  return [...map.values()];
}

async function DispatchContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, user, t, masters] = await Promise.all([searchParams, getCurrentUser(), today(), getActiveMasters()]);
  const range = resolveRange(sp, t, user.role === "owner" ? "7d" : "today");
  const customerId = intParam(sp, "customer");
  const [rows, customers, openInvoices, stockSnap, vehicles] = await Promise.all([
    getDispatchList(range.from, range.to, customerId),
    getCustomerOptions(),
    getAllOpenInvoices(t),
    getStock(t),
    getVehicleSuggestions(),
  ]);
  const params = flatParams(sp);
  const stock = Object.fromEntries(stockSnap.finished.map((f) => [f.productId, f.stock]));
  const minDate = user.role === "owner" ? undefined : addDays(t, -2);
  const filteredCustomer = customerId ? customers.find((c) => c.id === customerId) : undefined;
  // Every order still waiting for bricks, oldest first, with its customer.
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const openOrders: DispatchOrder[] = Object.entries(openInvoices)
    .flatMap(([cid, list]) =>
      list.map((o) => {
        const c = customerById.get(Number(cid));
        return {
          id: o.id,
          orderNo: o.invoiceNo,
          orderDate: o.invoiceDate,
          customerId: Number(cid),
          customerName: c ? (c.firmName ?? c.name) : "Customer",
          customerPhone: c?.phone ?? null,
          pending: o.pending,
          products: o.products.map((p) => ({ productId: p.productId, productName: p.productName, productCode: p.productCode, pending: p.pending })),
        };
      }),
    )
    .sort((a, b) => a.orderDate.localeCompare(b.orderDate) || a.id - b.id);
  const totals = new Map<number, number>();
  for (const r of rows) for (const it of r.items) totals.set(it.productId, (totals.get(it.productId) ?? 0) + it.quantity);

  const editButton = (r: DispatchRow) =>
    canModifyEntry(user, r, t) ? (
      <DispatchEditButton
        dispatch={{
          id: r.id,
          dispatchNo: r.dispatchNo,
          dispatchDate: r.dispatchDate,
          customerId: r.customerId,
          customerName: r.firmName ?? r.customerName,
          invoiceId: r.invoiceId,
          invoiceNo: r.invoiceNo,
          vehicleNo: r.vehicleNo,
          driverName: r.driverName,
          driverPhone: r.driverPhone,
          quantities: Object.fromEntries(r.items.map((i) => [i.productId, i.quantity])),
        }}
        lines={editLines(r, openInvoices[r.customerId])}
        stock={stock}
        vehicles={vehicles}
        today={t}
        minDate={minDate}
      />
    ) : null;

  return (
    <div className="space-y-4">
      <DispatchQuickEntry
        orders={openOrders}
        stock={stock}
        vehicles={vehicles}
        today={t}
        minDate={minDate}
        initialOrderId={intParam(sp, "order") ?? intParam(sp, "invoice") ?? undefined}
        initialCustomerId={customerId ?? undefined}
        canCreateOrder
      />

      <div className="space-y-2 pt-2">
        <RangeFilter pathname="/dispatch" params={params} preset={range.preset} from={range.from} to={range.to} />
        {filteredCustomer && (
          <Link
            href={`/dispatch${range.preset === "custom" ? `?from=${range.from}&to=${range.to}` : `?range=${range.preset}`}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/30 bg-foreground px-3 text-[13px] font-medium text-background"
          >
            Only {filteredCustomer.firmName ?? filteredCustomer.name}
            <X className="size-3.5" aria-label="Show all customers" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {masters.products.map((p, i) => (
          <div key={p.id} className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: productColor(p.code, i) }} aria-hidden />
              {p.name} sent
            </p>
            <p className="num mt-1 text-2xl font-semibold">{formatNumber(totals.get(p.id) ?? 0)}</p>
          </div>
        ))}
        <div className="col-span-2 rounded-xl border bg-card p-4 lg:col-span-1">
          <p className="text-[13px] font-medium text-muted-foreground">Trucks</p>
          <p className="num mt-1 text-2xl font-semibold">{rows.length}</p>
        </div>
      </div>

      <DispatchTable
        rows={rows.map((r) => ({ ...r, canDelete: canModifyEntry(user, r, t), edit: editButton(r) }))}
        products={masters.products.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
        today={t}
        emptyHint={`No trucks recorded for ${range.label.toLowerCase()}.`}
      />
    </div>
  );
}
