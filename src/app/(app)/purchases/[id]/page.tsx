import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, FileMinus, FilePlus, HandCoins, Lock, Pencil, Phone } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton } from "@/components/common/skeletons";
import { PaymentBadge, Pill, StateBadge } from "@/components/common/status-badge";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { CloseButton, ReopenButton } from "@/components/forms/close-buttons";
import { DeleteButton } from "@/components/forms/delete-button";
import { paymentStatus } from "@/domain/invoice";
import { round2 } from "@/domain/money";
import { billCloseBlocker, docState, isSettled } from "@/domain/settlement";
import { requireOwner } from "@/lib/auth";
import { materialColor } from "@/lib/colors";
import { formatDate, formatDateShort, formatDateTime, formatINR, formatNumber, formatTonnes, pct } from "@/lib/format";
import { today } from "@/lib/today";
import { SUPPLIER_NOTE_REASONS } from "@/lib/validators";
import {
  cancelPurchaseBill,
  closePurchaseBills,
  deleteSupplierNote,
  deleteSupplierPayment,
  reopenPurchaseBill,
} from "@/server/actions/purchases";
import { getBillDetail } from "@/server/queries/purchases";

export const metadata: Metadata = { title: "Supplier bill" };

const MODE: Record<string, string> = { cash: "Cash", upi: "UPI", bank: "Bank transfer", cheque: "Cheque", other: "Other" };

export default function BillPage({ params }: PageProps<"/purchases/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={8} />}>
      <BillContent params={params} />
    </Suspense>
  );
}

async function BillContent({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [bill, t] = await Promise.all([getBillDetail(id), today()]);
  if (!bill) notFound();

  const cancelled = bill.status === "cancelled";
  const state = docState({ cancelled, closedAt: bill.closedAt });
  const ongoing = state === "ongoing";
  const { paid, credits, debits, balance } = bill;
  const blocker = billCloseBlocker({ cancelled, closed: !ongoing, balance });
  const pStatus = paymentStatus({ total: bill.total, paid, credits, debits, dueDate: bill.dueDate, today: t, cancelled });
  const billed = round2(bill.total + debits);
  const settledBy = round2(paid + credits);
  const loadKg = bill.loads.reduce((a, l) => a + l.netKg, 0);

  return (
    <>
      <PageHeader
        backHref="/purchases"
        backLabel="Raw material bills"
        title={<span className="font-mono text-xl md:text-2xl">{bill.billNo}</span>}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/suppliers/${bill.supplierId}`} className="font-medium text-foreground hover:text-primary">
              {bill.supplier.name}
            </Link>
            {bill.supplierBillNo && <span>· their bill {bill.supplierBillNo}</span>}
            <span>· {formatDate(bill.billDate)}</span>
            {bill.dueDate && ongoing && <span>· pay by {formatDate(bill.dueDate)}</span>}
            <StateBadge kind="bill" state={state} ready={ongoing && !blocker} />
            {ongoing && <PaymentBadge status={pStatus} />}
          </span>
        }
        actions={
          ongoing && (
            <>
              <Button asChild variant="outline">
                <Link href={`/purchases/${bill.id}/edit`}>
                  <Pencil aria-hidden /> Edit
                </Link>
              </Button>
              {bill.payments.length === 0 && bill.adjustments.length === 0 && (
                <DeleteButton
                  id={bill.id}
                  action={cancelPurchaseBill}
                  variant="button"
                  confirmLabel="Cancel bill"
                  title={`Cancel ${bill.billNo}?`}
                  description="The bill stays in records marked as cancelled, is removed from what you owe, and its loads become unbilled again."
                />
              )}
            </>
          )
        }
      />

      {cancelled && (
        <Alert className="mb-4">
          <AlertDescription>This bill was cancelled{bill.cancelReason ? `: ${bill.cancelReason}` : "."}</AlertDescription>
        </Alert>
      )}

      {state === "closed" && (
        <Alert className="mb-4 border-success/40 bg-success/5">
          <Lock className="text-success" aria-hidden />
          <AlertDescription className="flex flex-col gap-3 text-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="font-medium">Closed</span>
              {bill.closedAt ? ` on ${formatDateTime(bill.closedAt)}` : ""}
              {bill.closedByName ? ` by ${bill.closedByName}` : ""}. Debit = credit ({formatINR(billed)} billed, {formatINR(settledBy)} paid and
              credited). Locked against new payments, notes and load changes.
            </span>
            <ReopenButton
              id={bill.id}
              action={reopenPurchaseBill}
              title={`Reopen ${bill.billNo}?`}
              description="The bill goes back to Ongoing so you can correct its payments, notes or loads. Close it again once debit and credit match."
            />
          </AlertDescription>
        </Alert>
      )}

      {ongoing && (
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {balance > 0 && (
            <NewEntryButton kind="supplierPayment" supplierId={bill.supplierId} billId={bill.id} className={ACTION}>
              <HandCoins aria-hidden /> Pay {formatINR(balance, { decimals: false })}
            </NewEntryButton>
          )}
          <NewEntryButton kind="supplierCredit" supplierId={bill.supplierId} billId={bill.id} variant="outline" className={ACTION}>
            <FileMinus aria-hidden /> Credit from supplier
          </NewEntryButton>
          <NewEntryButton kind="supplierDebit" supplierId={bill.supplierId} billId={bill.id} variant="outline" className={ACTION}>
            <FilePlus aria-hidden /> Extra charge
          </NewEntryButton>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-xl border bg-card">
            <h2 className="px-4 pt-4 font-semibold md:px-5">Materials billed</h2>
            <div className="overflow-x-auto">
              <Table className="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 md:pl-5">Material</TableHead>
                    <TableHead className="text-right">Tonnes</TableHead>
                    <TableHead className="text-right">Rate / t</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="pr-4 text-right md:pr-5">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.items.map((i, k) => (
                    <TableRow key={i.id}>
                      <TableCell className="pl-4 md:pl-5">
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: materialColor(i.materialCode, k) }} aria-hidden />
                          {i.materialName}
                        </span>
                      </TableCell>
                      <TableCell className="num text-right">{formatTonnes(i.quantityKg)}</TableCell>
                      <TableCell className="num text-right">{formatINR(i.ratePerTon)}</TableCell>
                      <TableCell className="num text-right">{i.gstRate}%</TableCell>
                      <TableCell className="num pr-4 text-right md:pr-5">{formatINR(i.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <SumRow label="Taxable value" value={bill.subtotal} />
                  {bill.transportCharges > 0 && <SumRow label="Transport" value={bill.transportCharges} />}
                  {bill.taxType === "inter" ? (
                    <SumRow label="IGST" value={bill.igst} />
                  ) : (
                    <>
                      <SumRow label="CGST" value={bill.cgst} />
                      <SumRow label="SGST" value={bill.sgst} />
                    </>
                  )}
                  {bill.roundOff !== 0 && <SumRow label="Round off" value={bill.roundOff} />}
                  <TableRow className="text-base">
                    <TableCell colSpan={4} className="pl-4 font-semibold md:pl-5">
                      Bill total
                    </TableCell>
                    <TableCell className="num pr-4 text-right font-semibold md:pr-5">{formatINR(bill.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4 md:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">Loads on this bill ({bill.loads.length})</h2>
              {bill.loads.length > 0 && <p className="num text-sm text-muted-foreground">{formatTonnes(loadKg)} weighed in</p>}
            </div>
            {bill.loads.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No inbound loads are linked to this bill.</p>
            ) : (
              <ul className="mt-3 divide-y rounded-lg border">
                {bill.loads.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-14 shrink-0 text-muted-foreground">{formatDateShort(l.entryDate)}</span>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: materialColor(l.materialCode) }} aria-hidden />
                      <span className="truncate">{l.materialName}</span>
                      {l.vehicleNo && <span className="hidden truncate font-mono text-xs whitespace-nowrap text-muted-foreground xl:inline">{l.vehicleNo}</span>}
                    </span>
                    <span className="num shrink-0">{formatNumber(l.netKg)} kg</span>
                    {l.amount !== null && <span className="num hidden w-20 shrink-0 text-right text-muted-foreground sm:inline">{formatINR(l.amount, { decimals: false })}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          {ongoing && (
            <section className={`rounded-xl border p-4 md:p-5 ${blocker ? "bg-card" : "border-success/40 bg-success/5"}`}>
              <h2 className="font-semibold">Close this bill</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex gap-2">
                  {isSettled(balance) ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className={isSettled(balance) ? "" : "text-muted-foreground"}>
                    Debit {formatINR(billed)} {isSettled(balance) ? "=" : "≠"} credit {formatINR(settledBy)}
                    {!isSettled(balance) && (
                      <span className="block text-xs">{balance > 0 ? `${formatINR(balance)} still to pay` : `${formatINR(-balance)} paid in excess`}</span>
                    )}
                  </span>
                </li>
              </ul>
              {blocker ? (
                <p className="mt-3 text-xs text-muted-foreground">{blocker}</p>
              ) : (
                <CloseButton
                  ids={[bill.id]}
                  action={closePurchaseBills}
                  label="Close bill"
                  className="mt-3 w-full"
                  title={`Close ${bill.billNo}?`}
                  description={`Debit = credit (${formatINR(billed)} billed, ${formatINR(settledBy)} paid and credited). The bill moves to Closed and is locked until you reopen it.`}
                />
              )}
            </section>
          )}

          <section className="rounded-xl border bg-card p-4 md:p-5">
            <h2 className="font-semibold">Account</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <MoneyRow label="Bill total" value={bill.total} />
              {debits > 0 && <MoneyRow label="+ Extra charges" value={debits} />}
              {credits > 0 && <MoneyRow label="− Supplier credits" value={credits} />}
              <MoneyRow label="− Paid" value={paid} />
            </dl>
            <div className="mt-3 flex items-baseline justify-between border-t pt-3">
              <span className="font-medium">{balance < 0 ? "Paid in excess" : "Still to pay"}</span>
              <span className={`num text-2xl font-semibold ${pStatus === "overdue" ? "text-destructive" : ""}`}>{formatINR(Math.abs(balance))}</span>
            </div>
            {billed > 0 && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(pct(settledBy, billed), 100)}%` }} />
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4 md:p-5">
            <h2 className="font-semibold">Payments made ({bill.payments.length})</h2>
            {bill.payments.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing paid yet.</p>
            ) : (
              <ul className="mt-3 divide-y">
                {bill.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{formatDate(p.paymentDate)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {MODE[p.mode]} · {p.voucherNo}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </p>
                    </div>
                    <span className="num font-semibold">{formatINR(p.amount)}</span>
                    {ongoing && (
                      <DeleteButton
                        id={p.id}
                        action={deleteSupplierPayment}
                        title={`Delete ${p.voucherNo}?`}
                        description="What you owe on this bill goes back up by this amount. The reason is kept in the activity log."
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {bill.adjustments.length > 0 && (
            <section className="rounded-xl border bg-card p-4 md:p-5">
              <h2 className="font-semibold">Credits & extra charges</h2>
              <ul className="mt-3 divide-y">
                {bill.adjustments.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium">
                        <Pill tone={n.type === "credit" ? "success" : "warning"}>{n.type === "credit" ? "Credit" : "Extra"}</Pill>
                        {formatDate(n.noteDate)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {SUPPLIER_NOTE_REASONS[n.reason as keyof typeof SUPPLIER_NOTE_REASONS] ?? n.reason}
                        {n.description ? ` · ${n.description}` : ""}
                      </p>
                    </div>
                    <span className="num font-semibold">
                      {n.type === "credit" ? "−" : "+"}
                      {formatINR(n.amount)}
                    </span>
                    {ongoing && (
                      <DeleteButton id={n.id} action={deleteSupplierNote} title={`Delete ${n.noteNo}?`} description="The bill's balance changes back. The reason is kept in the activity log." />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-xl border bg-card p-4 text-sm md:p-5">
            <h2 className="font-semibold">Supplier</h2>
            <Link href={`/suppliers/${bill.supplierId}`} className="mt-2 block font-medium hover:text-primary">
              {bill.supplier.name}
            </Link>
            {bill.supplier.phone && (
              <a href={`tel:${bill.supplier.phone}`} className="mt-1 flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <Phone className="size-3.5" aria-hidden /> {bill.supplier.phone}
              </a>
            )}
            {bill.supplier.gstin && <p className="mt-1 font-mono text-xs text-muted-foreground">GSTIN {bill.supplier.gstin}</p>}
            {bill.notes && <p className="mt-2 whitespace-pre-line">{bill.notes}</p>}
            <p className="mt-3 text-xs text-muted-foreground">Entered by {bill.createdByName}</p>
          </section>
        </div>
      </div>
    </>
  );
}

const ACTION = "h-auto min-h-12 rounded-xl";

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
