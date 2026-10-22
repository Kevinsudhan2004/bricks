import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { round2 } from "@/domain/money";
import { amountInWords, formatDate, formatINR, formatNumber } from "@/lib/format";
import { getInvoiceDetail } from "@/server/queries/invoices";
import { getCompany } from "@/server/queries/masters";
import { Letterhead, PartyBlock, Signatures } from "../../../doc-parts";

export const metadata: Metadata = { title: "Invoice" };

export default function PrintInvoicePage({ params }: PageProps<"/print/invoice/[id]">) {
  return (
    <Suspense fallback={<p className="text-neutral-500">Preparing invoice…</p>}>
      <PrintInvoice params={params} />
    </Suspense>
  );
}

async function PrintInvoice({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [inv, company] = await Promise.all([getInvoiceDetail(id), getCompany()]);
  if (!inv) notFound();
  const c = inv.customer;
  const hasTax = inv.cgst + inv.sgst + inv.igst > 0;
  const inter = inv.taxType === "inter";

  // GST summary by rate (transport rides on the principal line's rate)
  const byRate = new Map<number, number>();
  for (const it of inv.items) byRate.set(it.gstRate, round2((byRate.get(it.gstRate) ?? 0) + it.amount));
  if (inv.transportCharges > 0 && inv.items.length) {
    const principal = [...inv.items].sort((a, b) => b.amount - a.amount)[0];
    byRate.set(principal.gstRate, round2((byRate.get(principal.gstRate) ?? 0) + inv.transportCharges));
  }

  return (
    <article>
      {inv.status === "cancelled" && (
        <p className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-center font-semibold text-red-700">CANCELLED</p>
      )}
      <Letterhead
        company={company}
        title={hasTax ? "Tax Invoice" : "Invoice"}
        meta={[
          ["Invoice / Order No", inv.invoiceNo],
          ["Date", formatDate(inv.invoiceDate)],
          ...(inv.dueDate ? ([["Due date", formatDate(inv.dueDate)]] as [string, string][]) : []),
          ["Place of supply", c.stateName ?? company?.stateName ?? "—"],
        ]}
      />

      <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PartyBlock
          label="Bill to"
          name={c.firmName ?? c.name}
          lines={[c.firmName ? c.name : null, c.billingAddress, c.phone && `Ph: ${c.phone}`, c.gstin && `GSTIN: ${c.gstin}`, c.stateName]}
        />
        <PartyBlock label="Deliver to" name={c.firmName ?? c.name} lines={[inv.deliveryAddress ?? c.siteAddress]} />
      </section>

      <table className="mt-5 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-neutral-800 bg-neutral-100 text-left">
            <th className="px-2 py-1.5">#</th>
            <th className="px-2 py-1.5">Description</th>
            <th className="px-2 py-1.5">HSN</th>
            <th className="px-2 py-1.5 text-right">Qty</th>
            <th className="px-2 py-1.5 text-right">Rate</th>
            {hasTax && <th className="px-2 py-1.5 text-right">GST</th>}
            <th className="px-2 py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={it.id} className="border-b border-neutral-200 align-top">
              <td className="px-2 py-2">{i + 1}</td>
              <td className="px-2 py-2">
                <p className="font-medium">{it.productName}</p>
                {it.size && <p className="text-neutral-600">{it.size}</p>}
              </td>
              <td className="px-2 py-2">{it.hsnCode ?? ""}</td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatNumber(it.quantity)} {it.unit}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{formatINR(it.rate)}</td>
              {hasTax && <td className="px-2 py-2 text-right tabular-nums">{it.gstRate}%</td>}
              <td className="px-2 py-2 text-right tabular-nums">{formatINR(it.amount)}</td>
            </tr>
          ))}
          {inv.transportCharges > 0 && (
            <tr className="border-b border-neutral-200">
              <td className="px-2 py-2" />
              <td className="px-2 py-2" colSpan={hasTax ? 5 : 4}>
                Transport / loading charges
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{formatINR(inv.transportCharges)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <section className="mt-3 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div className="max-w-sm text-xs">
          <p className="font-semibold">Amount in words</p>
          <p className="text-neutral-700">{amountInWords(inv.total)}</p>
          {hasTax && (
            <table className="mt-3 w-full border-collapse">
              <thead>
                <tr className="border-y border-neutral-300 text-left">
                  <th className="py-1">GST %</th>
                  <th className="py-1 text-right">Taxable</th>
                  {inter ? <th className="py-1 text-right">IGST</th> : (
                    <>
                      <th className="py-1 text-right">CGST</th>
                      <th className="py-1 text-right">SGST</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...byRate.entries()].map(([rate, taxable]) => {
                  const tax = round2((taxable * rate) / 100);
                  return (
                    <tr key={rate} className="border-b border-neutral-200">
                      <td className="py-1">{rate}%</td>
                      <td className="py-1 text-right tabular-nums">{formatINR(taxable)}</td>
                      {inter ? (
                        <td className="py-1 text-right tabular-nums">{formatINR(tax)}</td>
                      ) : (
                        <>
                          <td className="py-1 text-right tabular-nums">{formatINR(tax / 2)}</td>
                          <td className="py-1 text-right tabular-nums">{formatINR(tax / 2)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <table className="w-full max-w-xs text-xs sm:w-72">
          <tbody>
            <tr>
              <td className="py-0.5 text-neutral-600">Taxable value</td>
              <td className="py-0.5 text-right tabular-nums">{formatINR(round2(inv.subtotal + inv.transportCharges))}</td>
            </tr>
            {inter ? (
              <tr>
                <td className="py-0.5 text-neutral-600">IGST</td>
                <td className="py-0.5 text-right tabular-nums">{formatINR(inv.igst)}</td>
              </tr>
            ) : (
              hasTax && (
                <>
                  <tr>
                    <td className="py-0.5 text-neutral-600">CGST</td>
                    <td className="py-0.5 text-right tabular-nums">{formatINR(inv.cgst)}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-neutral-600">SGST</td>
                    <td className="py-0.5 text-right tabular-nums">{formatINR(inv.sgst)}</td>
                  </tr>
                </>
              )
            )}
            {inv.roundOff !== 0 && (
              <tr>
                <td className="py-0.5 text-neutral-600">Round off</td>
                <td className="py-0.5 text-right tabular-nums">{formatINR(inv.roundOff)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-neutral-800 text-sm font-bold">
              <td className="pt-1">Grand total</td>
              <td className="pt-1 text-right tabular-nums">{formatINR(inv.total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 border-t border-neutral-300 pt-3 text-xs sm:grid-cols-2">
        {(company?.bankAccount || company?.upiId) && (
          <div>
            <p className="font-semibold">Payment details</p>
            {company.bankName && <p>{company.bankName}</p>}
            {company.bankAccount && <p>A/c: {company.bankAccount}</p>}
            {company.bankIfsc && <p>IFSC: {company.bankIfsc}</p>}
            {company.upiId && <p>UPI: {company.upiId}</p>}
          </div>
        )}
        {(company?.invoiceTerms || inv.notes) && (
          <div>
            <p className="font-semibold">Terms</p>
            {inv.notes && <p className="whitespace-pre-line">{inv.notes}</p>}
            {company?.invoiceTerms && <p className="whitespace-pre-line text-neutral-700">{company.invoiceTerms}</p>}
          </div>
        )}
      </section>

      <Signatures left="Customer's signature" right={`For ${company?.name ?? "the company"}`} />
      <p className="mt-6 text-center text-[10px] text-neutral-400">This is a computer-generated invoice.</p>
    </article>
  );
}
