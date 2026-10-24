import { NextResponse, type NextRequest } from "next/server";
import { actionUser, AuthError } from "@/lib/auth";
import { isValidIsoDate, todayIn } from "@/domain/dates";
import { APP_TIMEZONE } from "@/lib/today";
import { accountsUnchecked } from "@/server/queries/accounts";
import { invoiceSummariesUnchecked } from "@/server/queries/invoices";
import { customerBalancesUnchecked } from "@/server/queries/customers";
import { getDispatchList } from "@/server/queries/dispatch";
import { getInboundForExport } from "@/server/queries/inbound";
import { getPayments } from "@/server/queries/money";
import { getProductionList } from "@/server/queries/production";

/** CSV downloads for owners. Opens directly in Excel / Google Sheets. */
type Row = Record<string, string | number | null | undefined>;

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Guard against spreadsheet formula injection and quote when needed.
    const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/[entity]">) {
  try {
    await actionUser(["owner"]);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }
  const { entity } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  const t = todayIn(APP_TIMEZONE);
  const from = isValidIsoDate(sp.get("from") ?? "") ? sp.get("from")! : `${t.slice(0, 7)}-01`;
  const to = isValidIsoDate(sp.get("to") ?? "") ? sp.get("to")! : t;

  let rows: Row[] = [];
  switch (entity) {
    case "inbound":
      rows = (await getInboundForExport(from, to)).rows.map((r) => ({
        Date: r.entryDate,
        Material: r.materialName,
        Supplier: r.supplierName,
        "Weight kg": r.netKg,
        Tonnes: Math.round(r.netKg) / 1000,
        Amount: r.amount,
        "Entered by": r.createdByName,
      }));
      break;
    case "production":
      rows = (await getProductionList(from, to, null)).rows.map((r) => ({
        Date: r.entryDate,
        Product: r.productName,
        Shift: r.shift,
        Made: r.quantityProduced,
        Broken: r.quantityRejected,
        Good: r.quantityProduced - r.quantityRejected,
        "Entered by": r.createdByName,
        Remarks: r.remarks,
      }));
      break;
    case "dispatch":
      rows = (await getDispatchList(from, to, null)).flatMap((d) =>
        d.items.map((it) => ({
          Date: d.dispatchDate,
          Challan: d.dispatchNo,
          Invoice: d.invoiceNo,
          Customer: d.firmName ?? d.customerName,
          Product: it.name,
          Quantity: it.quantity,
          Vehicle: d.vehicleNo,
          Driver: d.driverName,
          "Entered by": d.createdByName,
        })),
      );
      break;
    case "orders":
    case "invoices":
      rows = (await invoiceSummariesUnchecked({ from, to }, t)).map((i) => ({
        Order: i.invoiceNo,
        Date: i.invoiceDate,
        "Due date": i.dueDate,
        Customer: i.firmName ?? i.customerName,
        Status: i.cancelled ? "Cancelled" : i.paymentStatus,
        "Bricks ordered": i.ordered,
        "Bricks delivered": i.delivered,
        "Bricks pending": i.pending,
        Total: i.total,
        Received: i.paid,
        "Credit notes": i.credits,
        "Debit notes": i.debits,
        Balance: i.balance,
      }));
      break;
    case "payments":
      rows = (await getPayments(from, to)).map((p) => ({
        Date: p.paymentDate,
        Receipt: p.receiptNo,
        Customer: p.firmName ?? p.customerName,
        Invoice: p.invoiceNo ?? "On account",
        Mode: p.mode,
        Reference: p.reference,
        Amount: p.amount,
      }));
      break;
    case "customers":
      rows = (await customerBalancesUnchecked()).map((c) => ({
        Customer: c.name,
        Firm: c.firmName,
        Phone: c.phone,
        State: c.stateName,
        "Opening balance": c.openingBalance,
        Billed: c.billed,
        Received: c.paid,
        "Credit notes": c.credits,
        "Debit notes": c.debits,
        Outstanding: c.outstanding,
        "Bricks ordered": c.ordered,
        "Bricks delivered": c.delivered,
        "Bricks pending": c.pending,
      }));
      break;
    case "accounts":
      rows = (await accountsUnchecked(t)).map((r) => ({
        Name: r.name,
        Contact: r.contact,
        Type: r.kind === "customer" ? "Customer" : "Supplier",
        Phone: r.phone,
        "Opening balance": r.openingBalance,
        Billed: r.billed,
        "Debit notes / extra charges": r.extra,
        "Received / paid": r.paid,
        Credits: r.credits,
        "They owe you": r.theyOwe,
        "You owe them": r.weOwe,
        Overdue: r.overdue,
        "Ongoing orders / bills": r.ongoing,
        "Last activity": r.lastActivity,
      }));
      break;
    default:
      return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  const name = entity === "customers" || entity === "accounts" ? `${entity}-${t}.csv` : `${entity}-${from}-to-${to}.csv`;
  return new NextResponse(`﻿${toCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
