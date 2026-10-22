import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ledgerTotals } from "@/domain/ledger";
import { formatDate, formatINR, formatNumber } from "@/lib/format";
import { today } from "@/lib/today";
import { getCustomerDashboard } from "@/server/queries/customers";
import { getCompany } from "@/server/queries/masters";
import { Letterhead, PartyBlock } from "../../../doc-parts";

export const metadata: Metadata = { title: "Statement of account" };

export default function PrintStatementPage({ params }: PageProps<"/print/statement/[id]">) {
  return (
    <Suspense fallback={<p className="text-neutral-500">Preparing statement…</p>}>
      <PrintStatement params={params} />
    </Suspense>
  );
}

async function PrintStatement({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const t = await today();
  const [data, company] = await Promise.all([getCustomerDashboard(id, t), getCompany()]);
  if (!data) notFound();
  const c = data.customer;
  const balance = data.ledger.at(-1)?.balance ?? c.openingBalance;
  const totals = ledgerTotals(data.ledger);
  const open = data.invoices.filter((i) => !i.cancelled && (i.pending > 0 || i.balance > 0));

  return (
    <article>
      <Letterhead company={company} title="Statement of Account" meta={[["As on", formatDate(t)]]} />
      <section className="mt-4 flex flex-col justify-between gap-4 sm:flex-row">
        <PartyBlock
          label="Customer"
          name={c.firmName ?? c.name}
          lines={[c.firmName ? c.name : null, c.billingAddress, c.phone && `Ph: ${c.phone}`, c.gstin && `GSTIN: ${c.gstin}`]}
        />
        <div className="rounded border-2 border-neutral-800 px-4 py-2 sm:text-right">
          <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{balance >= 0 ? "Balance due" : "Advance held"}</p>
          <p className="text-xl font-bold tabular-nums">{formatINR(Math.abs(balance))}</p>
        </div>
      </section>

      <table className="mt-5 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-neutral-800 bg-neutral-100 text-left">
            <th className="px-2 py-1.5">Date</th>
            <th className="px-2 py-1.5">Particulars</th>
            <th className="px-2 py-1.5 text-right">Debit</th>
            <th className="px-2 py-1.5 text-right">Credit</th>
            <th className="px-2 py-1.5 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {data.ledger.map((r, i) => (
            <tr key={i} className="border-b border-neutral-200 align-top">
              <td className="px-2 py-1.5 whitespace-nowrap">{r.date ? formatDate(r.date) : ""}</td>
              <td className="px-2 py-1.5">
                {r.ref && <span className="font-mono">{r.ref} </span>}
                <span className="text-neutral-600">{r.description}</span>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.debit ? formatINR(r.debit) : ""}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.credit ? formatINR(r.credit) : ""}</td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                {formatINR(Math.abs(r.balance))} {r.balance >= 0 ? "Dr" : "Cr"}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-neutral-800 font-bold">
            <td className="px-2 py-1.5" colSpan={2}>
              Total
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(totals.debit)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(totals.credit)}</td>
            <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
              {formatINR(Math.abs(balance))} {balance >= 0 ? "Dr" : "Cr"}
            </td>
          </tr>
        </tbody>
      </table>

      {open.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-semibold">Open orders</h2>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-neutral-800 bg-neutral-100 text-left">
                <th className="px-2 py-1.5">Order</th>
                <th className="px-2 py-1.5">Bricks pending delivery</th>
                <th className="px-2 py-1.5 text-right">Order total</th>
                <th className="px-2 py-1.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {open.map((i) => (
                <tr key={i.id} className="border-b border-neutral-200 align-top">
                  <td className="px-2 py-1.5">
                    <span className="font-mono">{i.invoiceNo}</span>
                    <span className="block text-neutral-500">{formatDate(i.invoiceDate)}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    {i.products.map((p) => (
                      <span key={p.productId} className="block">
                        {p.productName}: {formatNumber(p.pending)} of {formatNumber(p.ordered)}
                      </span>
                    ))}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(i.total)}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{formatINR(i.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="mt-8 text-center text-[10px] text-neutral-400">
        Please report any difference within 7 days. Computer-generated statement from {company?.name ?? "the company"}.
      </p>
    </article>
  );
}
