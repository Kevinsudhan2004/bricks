import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { amountInWords, formatDate, formatINR } from "@/lib/format";
import { NOTE_REASONS } from "@/lib/validators";
import { getCompany } from "@/server/queries/masters";
import { getNote } from "@/server/queries/money";
import { Letterhead, PartyBlock, Signatures } from "../../../doc-parts";

export const metadata: Metadata = { title: "Credit / debit note" };

export default function PrintNotePage({ params }: PageProps<"/print/note/[id]">) {
  return (
    <Suspense fallback={<p className="text-neutral-500">Preparing note…</p>}>
      <PrintNote params={params} />
    </Suspense>
  );
}

async function PrintNote({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [row, company] = await Promise.all([getNote(id), getCompany()]);
  if (!row) notFound();
  const n = row.note;
  const c = row.customer;
  const credit = n.type === "credit";
  return (
    <article>
      <Letterhead
        company={company}
        title={credit ? "Credit Note" : "Debit Note"}
        meta={[
          ["Note No", n.noteNo],
          ["Date", formatDate(n.noteDate)],
          ...(row.invoiceNo ? ([["Against invoice", row.invoiceNo]] as [string, string][]) : []),
        ]}
      />
      <section className="mt-4">
        <PartyBlock
          label={credit ? "Credited to" : "Debited to"}
          name={c.firmName ?? c.name}
          lines={[c.firmName ? c.name : null, c.billingAddress, c.gstin && `GSTIN: ${c.gstin}`]}
        />
      </section>
      <table className="mt-5 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-neutral-800 bg-neutral-100 text-left text-xs">
            <th className="px-2 py-1.5">Particulars</th>
            <th className="px-2 py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-neutral-200 align-top">
            <td className="px-2 py-3">
              <p className="font-medium">{NOTE_REASONS[n.reason as keyof typeof NOTE_REASONS] ?? n.reason}</p>
              {n.description && <p className="text-xs text-neutral-600">{n.description}</p>}
            </td>
            <td className="px-2 py-3 text-right font-semibold tabular-nums">{formatINR(n.amount)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs text-neutral-700">{amountInWords(n.amount)}</p>
      <p className="mt-3 text-xs text-neutral-600">
        Your account has been {credit ? "credited" : "debited"} with the above amount.
      </p>
      <Signatures left="Customer" right={`For ${company?.name ?? "the company"}`} />
    </article>
  );
}
