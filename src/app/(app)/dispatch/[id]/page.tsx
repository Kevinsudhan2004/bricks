import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Phone, Printer, Truck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton } from "@/components/common/skeletons";
import { DeleteButton } from "@/components/forms/delete-button";
import { getCurrentUser } from "@/lib/auth";
import { productColor } from "@/lib/colors";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { today } from "@/lib/today";
import { deleteDispatch } from "@/server/actions/dispatch";
import { canModifyEntry } from "@/server/permissions";
import { getDispatch } from "@/server/queries/dispatch";

export const metadata: Metadata = { title: "Dispatch" };

export default function DispatchDetailPage({ params }: PageProps<"/dispatch/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <DispatchDetail params={params} />
    </Suspense>
  );
}

async function DispatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [user, row, t] = await Promise.all([getCurrentUser(), getDispatch(id), today()]);
  if (!row) notFound();
  const d = row.dispatch;
  const editable = canModifyEntry(user, d, t);
  const isOwner = user.role === "owner";
  const total = row.items.reduce((a, i) => a + i.quantity, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        backHref="/dispatch"
        backLabel="Dispatch"
        title={<span className="font-mono text-xl md:text-2xl">{d.dispatchNo}</span>}
        description={`${formatDate(d.dispatchDate)} · entered by ${row.createdByName} at ${formatDateTime(d.createdAt)}`}
        actions={
          <>
            <Button asChild>
              <a href={`/print/challan/${d.id}`} target="_blank" rel="noopener">
                <Printer aria-hidden /> Print challan
              </a>
            </Button>
            {editable && (
              <>
                <DeleteButton
                  id={d.id}
                  action={deleteDispatch}
                  variant="button"
                  confirmLabel="Delete"
                  title={`Delete ${d.dispatchNo}?`}
                  description="These bricks will count as pending again on the order and return to yard stock."
                  redirectTo="/dispatch"
                />
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-xl border bg-card p-4 sm:col-span-2 md:p-5">
          <h2 className="font-semibold">Bricks on this truck</h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {row.items.map((it, i) => (
              <li key={it.productId} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <span className="h-10 w-1.5 rounded-full" style={{ background: productColor(it.code, i) }} aria-hidden />
                <div>
                  <p className="text-sm text-muted-foreground">{it.name}</p>
                  <p className="num text-2xl font-semibold">{formatNumber(it.quantity)}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="num mt-3 text-right text-sm text-muted-foreground">Total {formatNumber(total)} nos</p>
        </section>

        <section className="rounded-xl border bg-card p-4 text-sm md:p-5">
          <h2 className="font-semibold">Customer</h2>
          {isOwner ? (
            <Link href={`/customers/${row.customer.id}`} className="mt-2 block font-medium hover:text-primary">
              {row.customer.firmName ?? row.customer.name}
            </Link>
          ) : (
            <p className="mt-2 font-medium">{row.customer.firmName ?? row.customer.name}</p>
          )}
          {row.customer.phone && (
            <a href={`tel:${row.customer.phone}`} className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <Phone className="size-3.5" aria-hidden /> {row.customer.phone}
            </a>
          )}
          {(row.deliveryAddress ?? row.customer.siteAddress) && (
            <p className="mt-1 flex gap-1.5 text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {row.deliveryAddress ?? row.customer.siteAddress}
            </p>
          )}
          <p className="mt-3 text-muted-foreground">
            Order{" "}
            {isOwner ? (
              <Link href={`/orders/${d.invoiceId}`} className="font-mono text-xs font-medium text-foreground hover:text-primary">
                {row.invoiceNo}
              </Link>
            ) : (
              <span className="font-mono text-xs font-medium text-foreground">{row.invoiceNo}</span>
            )}
          </p>
        </section>

        <section className="rounded-xl border bg-card p-4 text-sm md:p-5">
          <h2 className="font-semibold">Vehicle</h2>
          <p className="mt-2 flex items-center gap-2">
            <Truck className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-mono">{d.vehicleNo ?? "—"}</span>
          </p>
          <p className="mt-1 flex items-center gap-2">
            <User className="size-4 text-muted-foreground" aria-hidden />
            {d.driverName ?? "—"}
            {d.driverPhone && (
              <a href={`tel:${d.driverPhone}`} className="text-muted-foreground hover:text-foreground">
                · {d.driverPhone}
              </a>
            )}
          </p>
          {d.remarks && <p className="mt-3 whitespace-pre-line text-muted-foreground">{d.remarks}</p>}
        </section>
      </div>
    </div>
  );
}
