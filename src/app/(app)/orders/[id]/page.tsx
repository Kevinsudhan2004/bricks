import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileMinus, FilePlus, IndianRupee, MapPin, Pencil, Phone, Printer, Truck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton } from "@/components/common/skeletons";
import { DeliveryBadge, PaymentBadge, Pill } from "@/components/common/status-badge";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { DeleteButton } from "@/components/forms/delete-button";
import { deliveryProgress, deliveryStatus, invoiceBalance, paymentStatus } from "@/domain/invoice";
import { round2 } from "@/domain/money";
import { productColor } from "@/lib/colors";
import { formatDate, formatINR, formatNumber, pct } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { today } from "@/lib/today";
import { canModifyEntry } from "@/server/permissions";
import { NOTE_REASONS } from "@/lib/validators";
import { cancelInvoice } from "@/server/actions/invoices";
import { getInvoiceDetail } from "@/server/queries/invoices";

export const metadata: Metadata = { title: "Order" };

export default function OrderPage({ params }: PageProps<"/orders/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={8} />}>
      <InvoiceContent params={params} />
    </Suspense>
  );
}

const MODE: Record<string, string> = { cash: "Cash", upi: "UPI", bank: "Bank transfer", cheque: "Cheque", other: "Other" };

async function InvoiceContent({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [inv, t, user] = await Promise.all([getInvoiceDetail(id), today(), getCurrentUser()]);
  if (!inv) notFound();
  const isOwner = user.role === "owner";

  const cancelled = inv.status === "cancelled";
  const delivered = inv.dispatches.flatMap((d) => d.items);
  const progress = deliveryProgress(inv.items.map((i) => ({ productId: i.productId, quantity: i.quantity })), delivered);
  const paid = round2(inv.payments.reduce((a, p) => a + p.amount, 0));
  const credits = round2(inv.adjustments.filter((n) => n.type === "credit").reduce((a, n) => a + n.amount, 0));
  const debits = round2(inv.adjustments.filter((n) => n.type === "debit").reduce((a, n) => a + n.amount, 0));
  const money = { total: inv.total, paid, credits, debits };
  const balance = invoiceBalance(money);
  const dStatus = deliveryStatus(progress.ordered, progress.delivered, cancelled);
  const pStatus = paymentStatus({ ...money, dueDate: inv.dueDate, today: t, cancelled });
  const customerName = inv.customer.firmName ?? inv.customer.name;
  const dispatchHref = `/dispatch?order=${inv.id}`;
  const productName = new Map(inv.items.map((i) => [i.productId, i.productName]));

  return (
    <>
      <PageHeader
        backHref="/orders"
        backLabel="Orders"
        title={<span className="font-mono text-xl md:text-2xl">{inv.invoiceNo}</span>}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {isOwner ? (
              <Link href={`/customers/${inv.customerId}`} className="font-medium text-foreground hover:text-primary">
                {customerName}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{customerName}</span>
            )}
            <span>· ordered {formatDate(inv.invoiceDate)}</span>
            {isOwner && inv.dueDate && <span>· payment due {formatDate(inv.dueDate)}</span>}
            <DeliveryBadge status={dStatus} />
            {isOwner && <PaymentBadge status={pStatus} />}
          </span>
        }
        actions={
          <>
            {isOwner && (
              <Button asChild variant="outline">
                <a href={`/print/invoice/${inv.id}`} target="_blank" rel="noopener">
                  <Printer aria-hidden /> Print invoice
                </a>
              </Button>
            )}
            {!cancelled && canModifyEntry(user, inv, t) && (
              <Button asChild variant="outline">
                <Link href={`/orders/${inv.id}/edit`}>
                  <Pencil aria-hidden /> Edit
                </Link>
              </Button>
            )}
            {isOwner && !cancelled && inv.dispatches.length === 0 && inv.payments.length === 0 && inv.adjustments.length === 0 && (
              <DeleteButton
                id={inv.id}
                action={cancelInvoice}
                variant="button"
                confirmLabel="Cancel order"
                title={`Cancel ${inv.invoiceNo}?`}
                description="The order stays in records marked as cancelled and is removed from all balances."
              />
            )}
          </>
        }
      />

      {cancelled && (
        <Alert className="mb-4">
          <AlertDescription>This order was cancelled{inv.cancelReason ? `: ${inv.cancelReason}` : "."}</AlertDescription>
        </Alert>
      )}

      {!cancelled && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {progress.pending > 0 && <QuickAction href={dispatchHref} icon={Truck} label="Dispatch bricks" primary />}
          {isOwner && (
            <>
              {balance > 0 && (
                <NewEntryButton
                  kind="payment"
                  customerId={inv.customerId}
                  invoiceId={inv.id}
                  variant={progress.pending === 0 ? "default" : "outline"}
                  className={ACTION}
                >
                  <IndianRupee aria-hidden /> Record payment
                </NewEntryButton>
              )}
              <NewEntryButton kind="credit" customerId={inv.customerId} invoiceId={inv.id} variant="outline" className={ACTION}>
                <FileMinus aria-hidden /> Credit note
              </NewEntryButton>
              <NewEntryButton kind="debit" customerId={inv.customerId} invoiceId={inv.id} variant="outline" className={ACTION}>
                <FilePlus aria-hidden /> Debit note
              </NewEntryButton>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {/* Delivery progress */}
          <section className="rounded-xl border bg-card p-4 md:p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Delivery</h2>
              <p className="num text-sm text-muted-foreground">
                {formatNumber(progress.delivered)} of {formatNumber(progress.ordered)} delivered
              </p>
            </div>
            <div className="mt-4 space-y-4">
              {progress.byProduct.map((p, i) => {
                const item = inv.items.find((x) => x.productId === p.productId);
                const done = pct(p.delivered, p.ordered);
                return (
                  <div key={p.productId}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="font-medium">{item?.productName}</p>
                      <p className="num text-sm">
                        {p.pending > 0 ? (
                          <>
                            <span className="text-lg font-semibold">{formatNumber(p.pending)}</span>
                            <span className="text-muted-foreground"> pending</span>
                          </>
                        ) : (
                          <span className="font-medium text-success">Fully delivered</span>
                        )}
                      </p>
                    </div>
                    <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${done}%`, background: productColor(item?.productCode ?? "", i) }}
                      />
                    </div>
                    <p className="num mt-1 text-xs text-muted-foreground">
                      {formatNumber(p.delivered)} delivered · {formatNumber(p.ordered)} ordered · {done}%
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Items */}
          {isOwner ? (
          <section className="overflow-hidden rounded-xl border bg-card">
            <h2 className="px-4 pt-4 font-semibold md:px-5">Items</h2>
            <div className="overflow-x-auto">
              <Table className="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 md:pl-5">Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="pr-4 text-right md:pr-5">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inv.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="pl-4 md:pl-5">
                        {i.productName}
                        {i.hsnCode && <span className="block text-xs text-muted-foreground">HSN {i.hsnCode}</span>}
                      </TableCell>
                      <TableCell className="num text-right">{formatNumber(i.quantity)}</TableCell>
                      <TableCell className="num text-right">{formatINR(i.rate)}</TableCell>
                      <TableCell className="num text-right">{i.gstRate}%</TableCell>
                      <TableCell className="num pr-4 text-right md:pr-5">{formatINR(i.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <SumRow label="Taxable value" value={inv.subtotal} />
                  {inv.transportCharges > 0 && <SumRow label="Transport" value={inv.transportCharges} />}
                  {inv.taxType === "inter" ? (
                    <SumRow label="IGST" value={inv.igst} />
                  ) : (
                    <>
                      <SumRow label="CGST" value={inv.cgst} />
                      <SumRow label="SGST" value={inv.sgst} />
                    </>
                  )}
                  {inv.roundOff !== 0 && <SumRow label="Round off" value={inv.roundOff} />}
                  <TableRow className="text-base">
                    <TableCell colSpan={4} className="pl-4 font-semibold md:pl-5">
                      Order total
                    </TableCell>
                    <TableCell className="num pr-4 text-right font-semibold md:pr-5">{formatINR(inv.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </section>
          ) : (
            <section className="rounded-xl border bg-card p-4 md:p-5">
              <h2 className="font-semibold">Ordered</h2>
              <ul className="mt-3 divide-y">
                {inv.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      {i.productName}
                      {i.size && <span className="block text-xs text-muted-foreground">{i.size}</span>}
                    </span>
                    <span className="num font-semibold">{formatNumber(i.quantity)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Dispatch history */}
          <section className="rounded-xl border bg-card p-4 md:p-5">
            <h2 className="font-semibold">Deliveries ({inv.dispatches.length})</h2>
            {inv.dispatches.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No bricks sent yet.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {inv.dispatches.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info/12 text-info">
                      <Truck className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/dispatch/${d.id}`} className="font-mono text-xs font-medium hover:text-primary">
                        {d.dispatchNo}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(d.dispatchDate)}
                        {d.vehicleNo ? ` · ${d.vehicleNo}` : ""}
                        {d.driverName ? ` · ${d.driverName}` : ""}
                      </p>
                    </div>
                    <div className="num text-right text-sm">
                      {d.items.map((it) => (
                        <p key={it.productId}>
                          {formatNumber(it.quantity)}{" "}
                          <span className="text-xs text-muted-foreground">{productName.get(it.productId)}</span>
                        </p>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-4">
          {/* Money */}
          {isOwner && (
          <>
          <section className="rounded-xl border bg-card p-4 md:p-5">
            <h2 className="font-semibold">Account</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <MoneyRow label="Order total" value={inv.total} />
              {debits > 0 && <MoneyRow label="+ Debit notes" value={debits} />}
              {credits > 0 && <MoneyRow label="− Credit notes" value={credits} />}
              <MoneyRow label="− Received" value={paid} />
            </dl>
            <div className="mt-3 flex items-baseline justify-between border-t pt-3">
              <span className="font-medium">{balance < 0 ? "Excess received" : "Balance due"}</span>
              <span className={`num text-2xl font-semibold ${pStatus === "overdue" ? "text-destructive" : ""}`}>
                {formatINR(Math.abs(balance))}
              </span>
            </div>
            {inv.total > 0 && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(pct(paid + credits, inv.total + debits), 100)}%` }} />
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4 md:p-5">
            <h2 className="font-semibold">Payments ({inv.payments.length})</h2>
            {inv.payments.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing received yet.</p>
            ) : (
              <ul className="mt-3 divide-y">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="font-medium">{formatDate(p.paymentDate)}</p>
                      <p className="text-xs text-muted-foreground">
                        {MODE[p.mode]} · {p.receiptNo}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </p>
                    </div>
                    <span className="num font-semibold text-success">{formatINR(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {inv.adjustments.length > 0 && (
            <section className="rounded-xl border bg-card p-4 md:p-5">
              <h2 className="font-semibold">Credit / debit notes</h2>
              <ul className="mt-3 divide-y">
                {inv.adjustments.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium">
                        <Pill tone={n.type === "credit" ? "success" : "warning"}>{n.type === "credit" ? "Credit" : "Debit"}</Pill>
                        {formatDate(n.noteDate)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {NOTE_REASONS[n.reason as keyof typeof NOTE_REASONS] ?? n.reason}
                        {n.description ? ` · ${n.description}` : ""}
                      </p>
                    </div>
                    <span className="num font-semibold">
                      {n.type === "credit" ? "−" : "+"}
                      {formatINR(n.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          </>
          )}

          <section className="rounded-xl border bg-card p-4 text-sm md:p-5">
            <h2 className="font-semibold">Customer</h2>
            {isOwner ? (
              <Link href={`/customers/${inv.customerId}`} className="mt-2 block font-medium hover:text-primary">
                {customerName}
              </Link>
            ) : (
              <p className="mt-2 font-medium">{customerName}</p>
            )}
            {inv.customer.phone && (
              <a href={`tel:${inv.customer.phone}`} className="mt-1 flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <Phone className="size-3.5" aria-hidden /> {inv.customer.phone}
              </a>
            )}
            {inv.deliveryAddress && (
              <p className="mt-1 flex gap-1.5 text-muted-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {inv.deliveryAddress}
              </p>
            )}
            {inv.notes && <p className="mt-2 whitespace-pre-line">{inv.notes}</p>}
            <p className="mt-3 text-xs text-muted-foreground">Entered by {inv.createdByName}</p>
          </section>
        </div>
      </div>
    </>
  );
}

const ACTION = "h-auto min-h-12 rounded-xl";

function QuickAction({
  href,
  icon: Icon,
  label,
  primary,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ${
        primary ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card hover:bg-accent"
      }`}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

function SumRow({ label, value }: { label: string; value: number }) {
  return (
    <TableRow>
      <TableCell colSpan={4} className="pl-4 text-muted-foreground md:pl-5">
        {label}
      </TableCell>
      <TableCell className="num pr-4 text-right md:pr-5">{formatINR(value)}</TableCell>
    </TableRow>
  );
}

function MoneyRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num font-medium">{formatINR(value)}</dd>
    </div>
  );
}
