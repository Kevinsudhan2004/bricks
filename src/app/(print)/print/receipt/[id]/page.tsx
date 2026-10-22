import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { amountInWords, formatDate, formatINR } from "@/lib/format";
import { getCompany } from "@/server/queries/masters";
import { getPayment } from "@/server/queries/money";
import { Letterhead, Signatures } from "../../../doc-parts";

export const metadata: Metadata = { title: "Payment receipt" };

const MODE: Record<string, string> = { cash: "Cash", upi: "UPI", bank: "Bank transfer", cheque: "Cheque", other: "Other" };

export default function PrintReceiptPage({ params }: PageProps<"/print/receipt/[id]">) {
  return (
    <Suspense fallback={<p className="text-neutral-500">Preparing receipt…</p>}>
      <PrintReceipt params={params} />
    </Suspense>
  );
}

async function PrintReceipt({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [row, company] = await Promise.all([getPayment(id), getCompany()]);
  if (!row) notFound();
  const p = row.payment;
  const c = row.customer;
  return (
    <article>
      <Letterhead company={company} title="Payment Receipt" meta={[["Receipt No", p.receiptNo], ["Date", formatDate(p.paymentDate)]]} />
      <div className="mt-6 space-y-3 text-sm leading-relaxed">
        <p>
          Received with thanks from <strong>{c.firmName ?? c.name}</strong>
          {c.firmName ? ` (${c.name})` : ""} the sum of <strong>{formatINR(p.amount)}</strong>.
        </p>
        <p className="text-neutral-700">{amountInWords(p.amount)}</p>
        <table className="mt-4 text-sm">
          <tbody>
            <tr>
              <td className="py-1 pr-6 text-neutral-500">Mode</td>
              <td className="py-1 font-medium">{MODE[p.mode]}</td>
            </tr>
            {p.reference && (
              <tr>
                <td className="py-1 pr-6 text-neutral-500">Reference</td>
                <td className="py-1 font-medium">{p.reference}</td>
              </tr>
            )}
            <tr>
              <td className="py-1 pr-6 text-neutral-500">Towards</td>
              <td className="py-1 font-medium">{row.invoiceNo ? `Order ${row.invoiceNo}` : "Advance / on account"}</td>
            </tr>
            {p.remarks && (
              <tr>
                <td className="py-1 pr-6 text-neutral-500">Remarks</td>
                <td className="py-1">{p.remarks}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-6 inline-block rounded border-2 border-neutral-800 px-4 py-2 text-lg font-bold tabular-nums">{formatINR(p.amount)}</p>
      </div>
      <Signatures left="Customer" right={`For ${company?.name ?? "the company"}`} />
    </article>
  );
}
