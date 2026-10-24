import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileMinus, FilePlus, FileStack, HandCoins, Phone, Plus, Wallet, Warehouse } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { StatCard } from "@/components/common/stat-card";
import { Pill } from "@/components/common/status-badge";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { BillList } from "@/components/purchases/bill-list";
import { ledgerTotals } from "@/domain/ledger";
import { round2 } from "@/domain/money";
import { requireOwner } from "@/lib/auth";
import { materialColor } from "@/lib/colors";
import { formatDate, formatINR, formatINRCompact, formatNumber, formatTonnes } from "@/lib/format";
import { today } from "@/lib/today";
import { cn } from "@/lib/utils";
import { getSupplierAccount } from "@/server/queries/purchases";

export const metadata: Metadata = { title: "Supplier account" };

export default function SupplierAccountPage({ params }: PageProps<"/suppliers/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <StatGridSkeleton count={4} />
          <ListSkeleton />
        </div>
      }
    >
      <SupplierAccount params={params} />
    </Suspense>
  );
}

async function SupplierAccount({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const t = await today();
  const data = await getSupplierAccount(id, t);
  if (!data) notFound();
  const { supplier: s, bills, payments, notes, loads, ledger } = data;

  const active = bills.filter((b) => !b.cancelled);
  const ongoing = active.filter((b) => b.state === "ongoing");
  const billed = round2(active.reduce((a, b) => a + b.total, 0));
  const paid = round2(payments.reduce((a, p) => a + p.amount, 0));
  const credits = round2(notes.filter((n) => n.type === "credit").reduce((a, n) => a + n.amount, 0));
  const extra = round2(notes.filter((n) => n.type === "debit").reduce((a, n) => a + n.amount, 0));
  const balance = ledger.at(-1)?.balance ?? s.openingBalance;
  const totals = ledgerTotals(ledger);
  const unbilled = loads.filter((l) => !l.billId);
  const unbilledKg = unbilled.reduce((a, l) => a + l.netKg, 0);

  return (
    <>
      <PageHeader
        backHref="/suppliers"
        backLabel="Suppliers"
        title={s.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {s.phone && (
              <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 hover:text-foreground">
                <Phone className="size-3.5" aria-hidden /> {s.phone}
              </a>
            )}
            {s.gstin && <span className="font-mono text-xs">GSTIN {s.gstin}</span>}
            {s.address && <span>{s.address}</span>}
            {!s.active && <Pill>Hidden</Pill>}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Billed"
          value={formatINRCompact(billed + extra)}
          hint={`${active.length} bill${active.length === 1 ? "" : "s"}${s.openingBalance ? ` · opening ${formatINRCompact(s.openingBalance)}` : ""}`}
          icon={FileStack}
        />
        <StatCard label="Paid" value={formatINRCompact(paid)} hint={`${payments.length} payment${payments.length === 1 ? "" : "s"}`} icon={HandCoins} tone="success" />
        <StatCard
          label={balance >= 0 ? "To pay" : "Advance with them"}
          value={formatINR(Math.abs(balance), { decimals: false })}
          hint={balance > 0 ? "You owe this supplier" : balance < 0 ? "You paid ahead" : credits ? `All settled · ${formatINRCompact(credits)} credits` : "All settled"}
          icon={Wallet}
          tone={balance > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Loads not billed yet"
          value={formatNumber(unbilled.length)}
          hint={unbilled.length ? `${formatTonnes(unbilledKg)} received, no bill entered` : "Every load is on a bill"}
          icon={Warehouse}
          tone={unbilled.length ? "info" : "default"}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NewEntryButton kind="bill" supplierId={s.id} className={ACTION}>
          <Plus aria-hidden /> New bill
        </NewEntryButton>
        <NewEntryButton kind="supplierPayment" supplierId={s.id} variant="outline" className={ACTION}>
          <HandCoins aria-hidden /> Pay
        </NewEntryButton>
        <NewEntryButton kind="supplierCredit" supplierId={s.id} variant="outline" className={ACTION}>
          <FileMinus aria-hidden /> Credit from them
        </NewEntryButton>
        <NewEntryButton kind="supplierDebit" supplierId={s.id} variant="outline" className={ACTION}>
          <FilePlus aria-hidden /> Extra charge
        </NewEntryButton>
      </div>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold">Ongoing bills ({ongoing.length})</h2>
        <BillList bills={ongoing} showSupplier={false} supplierId={s.id} bulkClose emptyText="No ongoing bills — everything is paid and closed." />
      </section>

      <Tabs defaultValue="statement" className="mt-6">
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="statement">Statement</TabsTrigger>
          <TabsTrigger value="bills">All bills ({bills.length})</TabsTrigger>
          <TabsTrigger value="loads">Loads ({loads.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="statement" className="mt-3">
          <div className="overflow-hidden rounded-xl border bg-card">
            <p className="border-b px-4 py-3 text-sm text-muted-foreground">Billed = bills and extra charges · Paid = payments and their credits · Balance = what you owe</p>
            {ledger.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              <div className="max-h-[32rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">Particulars</th>
                      <th className="px-3 py-2 text-right font-medium">Billed</th>
                      <th className="px-3 py-2 text-right font-medium">Paid</th>
                      <th className="px-3 py-2 text-right font-medium">To pay</th>
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
                          {formatINR(Math.abs(r.balance))}
                          {r.balance < 0 ? " adv" : ""}
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
                        {formatINR(Math.abs(balance))}
                        {balance < 0 ? " adv" : ""}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="bills" className="mt-3">
          <BillList bills={bills} showSupplier={false} supplierId={s.id} emptyText="No bills from this supplier yet" />
        </TabsContent>

        <TabsContent value="loads" className="mt-3">
          {loads.length === 0 ? (
            <EmptyState icon={Warehouse} title="No loads from this supplier" />
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {loads.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                  <span className="w-24 shrink-0 text-muted-foreground">{formatDate(l.entryDate)}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: materialColor(l.materialCode) }} aria-hidden />
                    <span className="truncate">{l.materialName}</span>
                  </span>
                  <span className="num shrink-0">{formatNumber(l.netKg)} kg</span>
                  <span className={cn("w-28 shrink-0 text-right")}>
                    {l.billId ? (
                      <Link href={`/purchases/${l.billId}`} className="font-mono text-xs hover:text-primary">
                        {l.billNo}
                      </Link>
                    ) : (
                      <Pill tone="info">Not billed</Pill>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

const ACTION = "h-auto min-h-12 rounded-xl";
