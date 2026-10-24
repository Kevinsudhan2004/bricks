import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FileMinus,
  FilePlus,
  FileText,
  IndianRupee,
  MapPin,
  MessageCircle,
  PackageCheck,
  PackageOpen,
  Pencil,
  Phone,
  Printer,
  Receipt,
  Truck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { StatCard } from "@/components/common/stat-card";
import { Pill, StateBadge } from "@/components/common/status-badge";
import { DeliveriesByMonthChart, InvoicePaymentChart } from "@/components/charts/lazy";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { InvoiceList } from "@/components/sales/invoice-list";
import { lastMonths } from "@/domain/dates";
import { ledgerTotals } from "@/domain/ledger";
import { round2 } from "@/domain/money";
import { productColor } from "@/lib/colors";
import { formatDate, formatINR, formatINRCompact, formatNumber, pct } from "@/lib/format";
import { today } from "@/lib/today";
import { NOTE_REASONS } from "@/lib/validators";
import { cn } from "@/lib/utils";
import { getCustomerDashboard } from "@/server/queries/customers";
import { getActiveMasters } from "@/server/queries/masters";
import { ArchiveCustomerButton } from "./archive-button";

export const metadata: Metadata = { title: "Customer" };

const MODE: Record<string, string> = { cash: "Cash", upi: "UPI", bank: "Bank", cheque: "Cheque", other: "Other" };

export default function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <StatGridSkeleton count={6} />
          <ListSkeleton />
        </div>
      }
    >
      <CustomerDashboard params={params} />
    </Suspense>
  );
}

function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

async function CustomerDashboard({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const t = await today();
  const [data, masters] = await Promise.all([getCustomerDashboard(id, t), getActiveMasters()]);
  if (!data) notFound();
  const { customer: c, invoices, dispatches, payments, notes, ledger, monthly } = data;

  const active = invoices.filter((i) => !i.cancelled);
  const ordered = active.reduce((a, i) => a + i.ordered, 0);
  const delivered = active.reduce((a, i) => a + i.delivered, 0);
  const pending = active.reduce((a, i) => a + i.pending, 0);
  const billed = round2(active.reduce((a, i) => a + i.total, 0));
  const received = round2(payments.reduce((a, p) => a + p.amount, 0));
  const balance = ledger.at(-1)?.balance ?? c.openingBalance;
  const totals = ledgerTotals(ledger);
  const openInvoices = active.filter((i) => i.state === "ongoing");
  const doneInvoices = invoices.filter((i) => !openInvoices.includes(i));
  const displayName = c.firmName ?? c.name;

  // Charts
  const months = lastMonths(t, 6);
  const monthlyData = months.map((m) => {
    const row: Record<string, number | string> = { month: m };
    for (const p of masters.products) row[`p${p.id}`] = 0;
    for (const r of monthly.filter((x) => x.month === m)) row[`p${r.productId}`] = r.quantity;
    return row;
  });
  const invoiceChart = active
    .slice(0, 8)
    .reverse()
    .map((i) => ({ invoiceNo: i.invoiceNo, total: i.total, received: round2(i.paid + i.credits - i.debits) }));

  const q = `customer=${c.id}`;
  const statementText = `Dear ${c.name}, your balance with us is ${formatINR(Math.abs(balance))} ${balance >= 0 ? "due" : "advance"} as of ${formatDate(t)}. Bricks pending delivery: ${formatNumber(pending)}. Thank you.`;

  return (
    <>
      <PageHeader
        backHref="/customers"
        backLabel="Customers"
        title={displayName}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {c.firmName && <span>{c.name}</span>}
            {c.gstin && <span className="font-mono text-xs">GSTIN {c.gstin}</span>}
            {c.stateName && <span>{c.stateName}</span>}
            {!c.active && <Pill>Archived</Pill>}
          </span>
        }
        actions={
          <>
            {c.phone && (
              <>
                <Button asChild variant="outline" size="icon" aria-label={`Call ${c.name}`}>
                  <a href={`tel:${c.phone}`}>
                    <Phone aria-hidden />
                  </a>
                </Button>
                <Button asChild variant="outline" size="icon" aria-label="Send balance on WhatsApp">
                  <a href={whatsappLink(c.phone, statementText)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden />
                  </a>
                </Button>
              </>
            )}
            <Button asChild variant="outline">
              <a href={`/print/statement/${c.id}`} target="_blank" rel="noopener">
                <Printer aria-hidden /> Statement
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/customers/${c.id}/edit`}>
                <Pencil aria-hidden /> Edit
              </Link>
            </Button>
            <ArchiveCustomerButton id={c.id} active={c.active} />
          </>
        }
      />

      {(c.siteAddress || c.phone) && (
        <p className="-mt-3 mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {c.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5" aria-hidden /> {c.phone}
              {c.altPhone ? ` / ${c.altPhone}` : ""}
            </span>
          )}
          {c.siteAddress && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden /> {c.siteAddress}
            </span>
          )}
        </p>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Bricks ordered" value={formatNumber(ordered)} hint={`${active.length} order${active.length === 1 ? "" : "s"}`} icon={FileText} />
        <StatCard label="Delivered" value={formatNumber(delivered)} progress={pct(delivered, ordered)} hint={`${pct(delivered, ordered)}% of order`} icon={PackageCheck} tone="success" />
        <StatCard label="Pending delivery" value={formatNumber(pending)} hint={(() => { const n = openInvoices.filter((i) => i.pending > 0).length; return `${n} open order${n === 1 ? "" : "s"}`; })()} icon={PackageOpen} tone="info" />
        <StatCard label="Billed" value={formatINRCompact(billed)} hint={c.openingBalance ? `+ opening ${formatINRCompact(c.openingBalance)}` : "Total of orders"} icon={Receipt} />
        <StatCard label="Received" value={formatINRCompact(received)} hint={`${payments.length} payment${payments.length === 1 ? "" : "s"}`} icon={IndianRupee} tone="success" />
        <StatCard
          label={balance >= 0 ? "Balance due" : "Advance held"}
          value={formatINR(Math.abs(balance), { decimals: false })}
          hint={balance > 0 ? "Customer owes you" : balance < 0 ? "You owe the customer" : "All settled"}
          icon={Wallet}
          tone={balance > 0 ? "warning" : "success"}
        />
      </div>

      {/* Quick actions */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <NewEntryButton kind="order" customerId={c.id} className={ACTION}>
          <FileText aria-hidden /> New order
        </NewEntryButton>
        <ActionLink href={`/dispatch?${q}`} icon={Truck} label="Dispatch" />
        <NewEntryButton kind="payment" customerId={c.id} variant="outline" className={ACTION}>
          <IndianRupee aria-hidden /> Payment
        </NewEntryButton>
        <NewEntryButton kind="credit" customerId={c.id} variant="outline" className={ACTION}>
          <FileMinus aria-hidden /> Credit note
        </NewEntryButton>
        <NewEntryButton kind="debit" customerId={c.id} variant="outline" className={cn(ACTION, "col-span-2 sm:col-span-1")}>
          <FilePlus aria-hidden /> Debit note
        </NewEntryButton>
      </div>

      {/* Open invoices — the heart of the customer dashboard */}
      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold">Ongoing orders</h2>
        {openInvoices.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Nothing ongoing" description="Every order is completed: delivered, and debit = credit." />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {openInvoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/orders/${inv.id}`}
                className="group block rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-mono text-sm font-medium group-hover:text-primary">
                      {inv.invoiceNo}
                      {inv.readyToClose && <StateBadge state="ongoing" ready className="font-sans" />}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(inv.invoiceDate)}
                      {inv.dueDate ? ` · due ${formatDate(inv.dueDate)}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn("num text-lg font-semibold", inv.paymentStatus === "overdue" && "text-destructive")}>
                      {formatINR(inv.balance, { decimals: false })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      due of {formatINR(inv.total, { decimals: false })}
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2.5">
                  {inv.products.map((p, i) => {
                    const done = pct(p.delivered, p.ordered);
                    return (
                      <div key={p.productId}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span>{p.productName}</span>
                          <span className="num">
                            {p.pending > 0 ? (
                              <>
                                <span className="font-semibold">{formatNumber(p.pending)}</span>
                                <span className="text-xs text-muted-foreground"> of {formatNumber(p.ordered)} pending</span>
                              </>
                            ) : (
                              <span className="text-xs font-medium text-success">All {formatNumber(p.ordered)} delivered</span>
                            )}
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${done}%`, background: productColor(p.productCode, i) }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {inv.total > 0 && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Paid</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-success"
                        style={{ width: `${Math.min(pct(inv.paid + inv.credits, inv.total + inv.debits), 100)}%` }}
                      />
                    </div>
                    <span className="num">{Math.min(pct(inv.paid + inv.credits, inv.total + inv.debits), 100)}%</span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Charts */}
      {(delivered > 0 || active.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DeliveriesByMonthChart
            products={masters.products.map((p) => ({ productId: p.id, name: p.name, code: p.code }))}
            data={monthlyData}
          />
          <InvoicePaymentChart data={invoiceChart} />
        </div>
      )}

      {/* History */}
      <Tabs defaultValue="statement" className="mt-6">
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="statement">Statement</TabsTrigger>
          <TabsTrigger value="invoices">All orders ({invoices.length})</TabsTrigger>
          <TabsTrigger value="dispatches">Deliveries ({dispatches.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="statement" className="mt-3">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <p className="text-sm text-muted-foreground">Debit = billed to customer · Credit = received / reduced</p>
              <Button asChild variant="ghost" size="sm">
                <a href={`/print/statement/${c.id}`} target="_blank" rel="noopener">
                  <Printer aria-hidden /> Print
                </a>
              </Button>
            </div>
            {ledger.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              <div className="max-h-[32rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">Particulars</th>
                      <th className="px-3 py-2 text-right font-medium">Debit</th>
                      <th className="px-3 py-2 text-right font-medium">Credit</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ledger.map((r, i) => (
                      <tr key={i} className="align-top">
                        <td className="px-3 py-2 whitespace-nowrap">{r.date ? formatDate(r.date) : ""}</td>
                        <td className="px-3 py-2">
                          {r.link ? (
                            <Link href={r.link} className="font-mono text-xs hover:text-primary">
                              {r.ref}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs">{r.ref}</span>
                          )}
                          <span className="block text-xs text-muted-foreground">{r.description}</span>
                        </td>
                        <td className="num px-3 py-2 text-right">{r.debit ? formatINR(r.debit) : ""}</td>
                        <td className="num px-3 py-2 text-right text-success">{r.credit ? formatINR(r.credit) : ""}</td>
                        <td className="num px-3 py-2 text-right font-medium whitespace-nowrap">
                          {formatINR(Math.abs(r.balance))} {r.balance >= 0 ? "Dr" : "Cr"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/40 font-medium">
                    <tr>
                      <td className="px-3 py-2" colSpan={2}>
                        Total
                      </td>
                      <td className="num px-3 py-2 text-right">{formatINR(totals.debit)}</td>
                      <td className="num px-3 py-2 text-right">{formatINR(totals.credit)}</td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap">
                        {formatINR(Math.abs(balance))} {balance >= 0 ? "Dr" : "Cr"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-3">
          <InvoiceList invoices={[...openInvoices, ...doneInvoices]} showCustomer={false} emptyText="No invoices yet" customerId={c.id} bulkClose />
        </TabsContent>

        <TabsContent value="dispatches" className="mt-3">
          {dispatches.length === 0 ? (
            <EmptyState icon={Truck} title="No deliveries yet" />
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {dispatches.map((d) => (
                <li key={d.id}>
                  <Link href={`/dispatch/${d.id}`} className="flex items-center gap-3 p-3.5 hover:bg-muted/40">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info/12 text-info">
                      <Truck className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{formatDate(d.dispatchDate)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{d.dispatchNo}</span> · {d.invoiceNo}
                        {d.vehicleNo ? ` · ${d.vehicleNo}` : ""}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      {(d.items ?? []).map((it) => (
                        <p key={it.productId} className="num">
                          <span className="font-semibold">{formatNumber(it.quantity)}</span>{" "}
                          <span className="text-xs text-muted-foreground">{it.name}</span>
                        </p>
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-3">
          {payments.length === 0 ? (
            <EmptyState icon={IndianRupee} title="No payments yet" />
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/12 text-success">
                    <IndianRupee className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{formatDate(p.paymentDate)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {MODE[p.mode]} · <span className="font-mono">{p.receiptNo}</span> · {p.invoiceNo ?? "On account"}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                  </div>
                  <span className="num font-semibold text-success">{formatINR(p.amount)}</span>
                  <Button asChild variant="ghost" size="icon-sm" aria-label="Print receipt">
                    <a href={`/print/receipt/${p.id}`} target="_blank" rel="noopener">
                      <Printer aria-hidden />
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-3">
          {notes.length === 0 ? (
            <EmptyState icon={FileMinus} title="No credit or debit notes" />
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {notes.map((n) => (
                <li key={n.id} className="flex items-center gap-3 p-3.5">
                  <Pill tone={n.type === "credit" ? "success" : "warning"}>{n.type === "credit" ? "Credit" : "Debit"}</Pill>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {formatDate(n.noteDate)} · {NOTE_REASONS[n.reason as keyof typeof NOTE_REASONS] ?? n.reason}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{n.noteNo}</span>
                      {n.invoiceNo ? ` · ${n.invoiceNo}` : ""}
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
          )}
        </TabsContent>
      </Tabs>

      {c.notes && (
        <section className="mt-6 rounded-xl border bg-card p-4 text-sm">
          <h2 className="font-semibold">Notes</h2>
          <p className="mt-1 whitespace-pre-line text-muted-foreground">{c.notes}</p>
        </section>
      )}
    </>
  );
}

const ACTION = "h-auto min-h-12 rounded-xl";

function ActionLink({
  href,
  icon: Icon,
  label,
  primary,
  className,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  primary?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors",
        primary ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card hover:bg-accent",
        className,
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
