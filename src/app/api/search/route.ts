import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { customers, dispatches, invoices } from "@/db/schema";
import { actionUser, AuthError } from "@/lib/auth";
import { formatDate } from "@/lib/format";

/** Global search (Ctrl/⌘+K) across customers, invoices, challans and vehicle numbers. Owners only. */
export async function GET(request: NextRequest) {
  try {
    await actionUser(["owner"]);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ customers: [], invoices: [], dispatches: [] });
  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const [c, i, d] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name, firmName: customers.firmName, phone: customers.phone })
      .from(customers)
      .where(or(ilike(customers.name, like), ilike(customers.firmName, like), ilike(customers.phone, like)))
      .orderBy(customers.name)
      .limit(6),
    db
      .select({ id: invoices.id, no: invoices.invoiceNo, date: invoices.invoiceDate, name: customers.name, firmName: customers.firmName })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(or(ilike(invoices.invoiceNo, like), ilike(customers.name, like), ilike(customers.firmName, like)))
      .orderBy(desc(invoices.invoiceDate))
      .limit(6),
    db
      .select({ id: dispatches.id, no: dispatches.dispatchNo, date: dispatches.dispatchDate, vehicle: dispatches.vehicleNo, name: customers.name })
      .from(dispatches)
      .innerJoin(customers, eq(customers.id, dispatches.customerId))
      .where(and(isNull(dispatches.deletedAt), or(ilike(dispatches.dispatchNo, like), ilike(dispatches.vehicleNo, like))))
      .orderBy(desc(dispatches.dispatchDate))
      .limit(6),
  ]);

  return NextResponse.json(
    {
      customers: c.map((x) => ({ id: x.id, name: x.firmName ?? x.name, sub: [x.firmName ? x.name : null, x.phone].filter(Boolean).join(" · ") })),
      invoices: i.map((x) => ({ id: x.id, no: x.no, sub: `${x.firmName ?? x.name} · ${formatDate(x.date)}` })),
      dispatches: d.map((x) => ({ id: x.id, no: x.no, sub: `${x.name} · ${formatDate(x.date)}${x.vehicle ? ` · ${x.vehicle}` : ""}` })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
