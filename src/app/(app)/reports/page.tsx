import type { Metadata } from "next";
import { Suspense } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { RangeFilter } from "@/components/common/range-filter";
import { ListSkeleton } from "@/components/common/skeletons";
import { requireOwner } from "@/lib/auth";
import { materialColor, productColor } from "@/lib/colors";
import { resolveRange } from "@/lib/date-range";
import { formatDateShort, formatINR, formatMonth, formatNumber } from "@/lib/format";
import { flatParams, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { getReports } from "@/server/queries/dashboard";

export const metadata: Metadata = { title: "Reports" };

const EXPORTS = [
  { key: "inbound", label: "Inbound loads" },
  { key: "production", label: "Production" },
  { key: "dispatch", label: "Dispatches" },
  { key: "orders", label: "Orders" },
  { key: "payments", label: "Payments" },
  { key: "customers", label: "Customer balances" },
];

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <>
      <PageHeader title="Reports" description="Daily factory register, GST summary and spreadsheet downloads." />
      <Suspense fallback={<ListSkeleton rows={8} />}>
        <Reports searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Reports({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const [sp, t] = await Promise.all([searchParams, today()]);
  const range = resolveRange(sp, t, "month");
  const r = await getReports(range.from, range.to);
  const totals = {
    made: r.products.map((p) => r.register.reduce((a, d) => a + (d.made[p.id] ?? 0), 0)),
    sent: r.products.map((p) => r.register.reduce((a, d) => a + (d.sent[p.id] ?? 0), 0)),
    broken: r.register.reduce((a, d) => a + d.broken, 0),
    inbound: r.materials.map((m) => r.register.reduce((a, d) => a + (d.inbound[m.id] ?? 0), 0)),
  };
  const gstTotals = r.gst.reduce(
    (a, g) => ({
      invoices: a.invoices + g.invoices,
      taxable: a.taxable + g.taxable,
      cgst: a.cgst + g.cgst,
      sgst: a.sgst + g.sgst,
      igst: a.igst + g.igst,
      total: a.total + g.total,
    }),
    { invoices: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
  );

  return (
    <div className="space-y-6">
      <RangeFilter
        pathname="/reports"
        params={flatParams(sp)}
        preset={range.preset}
        from={range.from}
        to={range.to}
        presets={["7d", "30d", "month", "lastmonth", "90d"]}
      />

      <section className="rounded-xl border bg-card p-4 md:p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileSpreadsheet className="size-4" aria-hidden /> Download for Excel · {range.label}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {EXPORTS.map((e) => (
            <Button key={e.key} asChild variant="outline" className="justify-start">
              <a href={`/api/export/${e.key}?from=${range.from}&to=${range.to}`} download>
                <Download aria-hidden /> {e.label}
              </a>
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">GST summary</h2>
        <p className="text-sm text-muted-foreground">Totals of orders billed each month — handy for GSTR-1 / GSTR-3B. Please verify with your accountant.</p>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Month</th>
                <th className="px-3 py-2 text-right font-medium">Orders</th>
                <th className="px-3 py-2 text-right font-medium">Taxable value</th>
                <th className="px-3 py-2 text-right font-medium">CGST</th>
                <th className="px-3 py-2 text-right font-medium">SGST</th>
                <th className="px-3 py-2 text-right font-medium">IGST</th>
                <th className="px-3 py-2 text-right font-medium">Invoice value</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.gst.map((g) => (
                <tr key={g.month}>
                  <td className="px-3 py-2">{formatMonth(g.month)}</td>
                  <td className="num px-3 py-2 text-right">
                    {g.invoices} <span className="text-xs text-muted-foreground">({g.b2b} B2B)</span>
                  </td>
                  <td className="num px-3 py-2 text-right">{formatINR(g.taxable)}</td>
                  <td className="num px-3 py-2 text-right">{formatINR(g.cgst)}</td>
                  <td className="num px-3 py-2 text-right">{formatINR(g.sgst)}</td>
                  <td className="num px-3 py-2 text-right">{formatINR(g.igst)}</td>
                  <td className="num px-3 py-2 text-right font-medium">{formatINR(g.total)}</td>
                </tr>
              ))}
              {r.gst.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    No invoices in this period.
                  </td>
                </tr>
              )}
            </tbody>
            {r.gst.length > 1 && (
              <tfoot className="border-t bg-muted/40 font-medium">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="num px-3 py-2 text-right">{gstTotals.invoices}</td>
                  <td className="num px-3 py-2 text-right">{formatINR(gstTotals.taxable)}</td>
                  <td className="num px-3 py-2 text-right">{formatINR(gstTotals.cgst)}</td>
                  <td className="num px-3 py-2 text-right">{formatINR(gstTotals.sgst)}</td>
                  <td className="num px-3 py-2 text-right">{formatINR(gstTotals.igst)}</td>
                  <td className="num px-3 py-2 text-right">{formatINR(gstTotals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Daily factory register</h2>
        <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs">
              <tr>
                <th rowSpan={2} className="px-3 py-2 text-left font-medium">
                  Date
                </th>
                <th colSpan={r.products.length + 1} className="border-l px-3 pt-2 text-center font-medium">
                  Made
                </th>
                <th colSpan={r.products.length} className="border-l px-3 pt-2 text-center font-medium">
                  Dispatched
                </th>
                <th colSpan={r.materials.length} className="border-l px-3 pt-2 text-center font-medium">
                  Received (t)
                </th>
              </tr>
              <tr>
                {r.products.map((p, i) => (
                  <th key={`m${p.id}`} className={`px-3 pb-2 text-right font-normal ${i === 0 ? "border-l" : ""}`}>
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full" style={{ background: productColor(p.code, i) }} aria-hidden />
                      {p.name.split(" ")[0]}
                    </span>
                  </th>
                ))}
                <th className="px-3 pb-2 text-right font-normal">Broken</th>
                {r.products.map((p, i) => (
                  <th key={`s${p.id}`} className={`px-3 pb-2 text-right font-normal ${i === 0 ? "border-l" : ""}`}>
                    {p.name.split(" ")[0]}
                  </th>
                ))}
                {r.materials.map((m, i) => (
                  <th key={m.id} className={`px-3 pb-2 text-right font-normal ${i === 0 ? "border-l" : ""}`}>
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-[2px]" style={{ background: materialColor(m.code, i) }} aria-hidden />
                      {m.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.register.map((d) => (
                <tr key={d.date} className="hover:bg-muted/30">
                  <td className="px-3 py-1.5 whitespace-nowrap">{formatDateShort(d.date)}</td>
                  {r.products.map((p, i) => (
                    <td key={p.id} className={`num px-3 py-1.5 text-right ${i === 0 ? "border-l" : ""}`}>
                      {d.made[p.id] ? formatNumber(d.made[p.id]) : <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                  <td className="num px-3 py-1.5 text-right text-muted-foreground">{d.broken ? formatNumber(d.broken) : "—"}</td>
                  {r.products.map((p, i) => (
                    <td key={p.id} className={`num px-3 py-1.5 text-right ${i === 0 ? "border-l" : ""}`}>
                      {d.sent[p.id] ? formatNumber(d.sent[p.id]) : <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                  {r.materials.map((m, i) => (
                    <td key={m.id} className={`num px-3 py-1.5 text-right ${i === 0 ? "border-l" : ""}`}>
                      {d.inbound[m.id] ? (d.inbound[m.id] / 1000).toFixed(1) : <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 border-t bg-muted font-medium">
              <tr>
                <td className="px-3 py-2">Total</td>
                {totals.made.map((v, i) => (
                  <td key={i} className={`num px-3 py-2 text-right ${i === 0 ? "border-l" : ""}`}>
                    {formatNumber(v)}
                  </td>
                ))}
                <td className="num px-3 py-2 text-right">{formatNumber(totals.broken)}</td>
                {totals.sent.map((v, i) => (
                  <td key={i} className={`num px-3 py-2 text-right ${i === 0 ? "border-l" : ""}`}>
                    {formatNumber(v)}
                  </td>
                ))}
                {totals.inbound.map((v, i) => (
                  <td key={i} className={`num px-3 py-2 text-right ${i === 0 ? "border-l" : ""}`}>
                    {(v / 1000).toFixed(1)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
