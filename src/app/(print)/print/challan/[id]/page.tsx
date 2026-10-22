import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import { getDispatch } from "@/server/queries/dispatch";
import { getCompany } from "@/server/queries/masters";
import { Letterhead, PartyBlock, Signatures } from "../../../doc-parts";

export const metadata: Metadata = { title: "Delivery challan" };

export default function PrintChallanPage({ params }: PageProps<"/print/challan/[id]">) {
  return (
    <Suspense fallback={<p className="text-neutral-500">Preparing challan…</p>}>
      <PrintChallan params={params} />
    </Suspense>
  );
}

async function PrintChallan({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [row, company] = await Promise.all([getDispatch(id), getCompany()]);
  if (!row) notFound();
  const d = row.dispatch;
  const c = row.customer;
  const total = row.items.reduce((a, i) => a + i.quantity, 0);

  return (
    <article>
      <Letterhead
        company={company}
        title="Delivery Challan"
        meta={[
          ["Challan No", d.dispatchNo],
          ["Date", formatDate(d.dispatchDate)],
          ["Order No", row.invoiceNo],
        ]}
      />
      <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PartyBlock
          label="Customer"
          name={c.firmName ?? c.name}
          lines={[c.firmName ? c.name : null, c.phone && `Ph: ${c.phone}`, c.gstin && `GSTIN: ${c.gstin}`]}
        />
        <PartyBlock label="Deliver to" name="Site" lines={[row.deliveryAddress ?? c.siteAddress ?? c.billingAddress]} />
      </section>

      <section className="mt-4 grid grid-cols-3 gap-3 rounded border border-neutral-300 p-3 text-xs">
        <div>
          <p className="text-neutral-500">Vehicle</p>
          <p className="font-semibold">{d.vehicleNo ?? "—"}</p>
        </div>
        <div>
          <p className="text-neutral-500">Driver</p>
          <p className="font-semibold">{d.driverName ?? "—"}</p>
        </div>
        <div>
          <p className="text-neutral-500">Driver phone</p>
          <p className="font-semibold">{d.driverPhone ?? "—"}</p>
        </div>
      </section>

      <table className="mt-5 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-neutral-800 bg-neutral-100 text-left text-xs">
            <th className="px-2 py-1.5">#</th>
            <th className="px-2 py-1.5">Item</th>
            <th className="px-2 py-1.5 text-right">Quantity (nos)</th>
          </tr>
        </thead>
        <tbody>
          {row.items.map((it, i) => (
            <tr key={it.productId} className="border-b border-neutral-200">
              <td className="px-2 py-2.5">{i + 1}</td>
              <td className="px-2 py-2.5 font-medium">{it.name}</td>
              <td className="px-2 py-2.5 text-right text-base font-semibold tabular-nums">{formatNumber(it.quantity)}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td />
            <td className="px-2 py-2">Total</td>
            <td className="px-2 py-2 text-right tabular-nums">{formatNumber(total)}</td>
          </tr>
        </tbody>
      </table>

      {d.remarks && <p className="mt-4 text-xs whitespace-pre-line">Remarks: {d.remarks}</p>}
      <p className="mt-4 text-xs text-neutral-600">
        Received the above bricks in good condition. Breakage during unloading is the receiver&apos;s responsibility.
      </p>
      <Signatures left="Receiver's signature & seal" right={`For ${company?.name ?? "the company"}`} />
      <div className="mt-8 flex justify-start">
        <div className="w-44 border-t border-neutral-400 pt-1 text-center text-xs text-neutral-600">Driver&apos;s signature</div>
      </div>
    </article>
  );
}
