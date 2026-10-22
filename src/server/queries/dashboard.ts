import "server-only";
import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { ageingBuckets } from "@/domain/ageing";
import { addDays, dateRange, lastMonths, startOfMonth } from "@/domain/dates";
import { num, round2 } from "@/domain/money";
import { requireOwner } from "@/lib/auth";
import { TAG } from "@/server/tags";
import { customerBalancesUnchecked } from "./customers";
import { invoiceSummariesUnchecked } from "./invoices";
import { stockUnchecked } from "./stock";

/* Daily series --------------------------------------------------------- */

async function loadDaily(from: string, to: string) {
  "use cache";
  cacheTag(TAG.production, TAG.dispatch, TAG.inbound, TAG.stockAdj, TAG.masters);
  cacheLife("live");
  const [production, dispatch, inbound, adjustments] = await Promise.all([
    db.execute<{ d: string; product_id: number; produced: number; rejected: number }>(sql`
      select entry_date::text as d, product_id, sum(quantity_produced)::int as produced, sum(quantity_rejected)::int as rejected
      from production_entries where deleted_at is null and entry_date between ${from} and ${to}
      group by 1, 2`),
    db.execute<{ d: string; product_id: number; qty: number }>(sql`
      select d.dispatch_date::text as d, di.product_id, sum(di.quantity)::int as qty
      from dispatches d join dispatch_items di on di.dispatch_id = d.id
      where d.deleted_at is null and d.dispatch_date between ${from} and ${to}
      group by 1, 2`),
    db.execute<{ d: string; material_id: number; kg: string }>(sql`
      select entry_date::text as d, material_id, sum(net_kg) as kg
      from inbound_entries where deleted_at is null and entry_date between ${from} and ${to}
      group by 1, 2`),
    db.execute<{ d: string; product_id: number; qty: string }>(sql`
      select adj_date::text as d, product_id, sum(quantity) as qty
      from stock_adjustments where deleted_at is null and item_type = 'product' and adj_date between ${from} and ${to}
      group by 1, 2`),
  ]);
  return {
    production: production.map((r) => ({ date: r.d, productId: r.product_id, produced: r.produced, rejected: r.rejected })),
    dispatch: dispatch.map((r) => ({ date: r.d, productId: r.product_id, qty: r.qty })),
    inbound: inbound.map((r) => ({ date: r.d, materialId: r.material_id, kg: num(r.kg) })),
    adjustments: adjustments.map((r) => ({ date: r.d, productId: r.product_id, qty: num(r.qty) })),
  };
}

/* Money by month ------------------------------------------------------- */

async function loadMonthlyMoney(fromMonthStart: string) {
  "use cache";
  cacheTag(TAG.invoices, TAG.payments);
  cacheLife("live");
  const [billed, collected] = await Promise.all([
    db.execute<{ m: string; amount: string }>(sql`
      select to_char(invoice_date, 'YYYY-MM') as m, sum(total) as amount
      from invoices where status = 'active' and invoice_date >= ${fromMonthStart} group by 1`),
    db.execute<{ m: string; amount: string }>(sql`
      select to_char(payment_date, 'YYYY-MM') as m, sum(amount) as amount
      from payments where deleted_at is null and payment_date >= ${fromMonthStart} group by 1`),
  ]);
  return {
    billed: billed.map((r) => ({ month: r.m, amount: num(r.amount) })),
    collected: collected.map((r) => ({ month: r.m, amount: num(r.amount) })),
  };
}

/* Assembled dashboard -------------------------------------------------- */

export async function getDashboard(from: string, to: string, today: string) {
  await requireOwner();
  const monthStart = startOfMonth(today);
  const months = lastMonths(today, 6);

  const [daily, stockNow, stockBefore, monthly, invoices, balances] = await Promise.all([
    loadDaily(from, to),
    stockUnchecked(today),
    stockUnchecked(addDays(from, -1)),
    loadMonthlyMoney(`${months[0]}-01`),
    invoiceSummariesUnchecked({}, today),
    customerBalancesUnchecked(),
  ]);
  // Today's numbers come from a separate (tiny) cached read so the range can be anything.
  const todayData = from <= today && today <= to ? daily : await loadDaily(today, today);
  const monthData = monthStart >= from ? daily : await loadDaily(monthStart, today);

  const products = stockNow.finished;
  const materials = stockNow.raw;
  const days = dateRange(from, to);

  /* Production & dispatch per product per day */
  const productionSeries = products.map((p) => ({
    productId: p.productId,
    name: p.name,
    code: p.code,
    capacity: p.dailyCapacity,
    points: days.map((d) => {
      const prod = daily.production.filter((x) => x.date === d && x.productId === p.productId);
      return {
        date: d,
        made: prod.reduce((a, x) => a + x.produced, 0),
        rejected: prod.reduce((a, x) => a + x.rejected, 0),
        sent: daily.dispatch.filter((x) => x.date === d && x.productId === p.productId).reduce((a, x) => a + x.qty, 0),
      };
    }),
  }));

  /* Yard stock trend: opening stock + cumulative daily change */
  const yardSeries = days.map((d) => ({ date: d }) as Record<string, number | string>);
  for (const p of products) {
    let running = stockBefore.finished.find((s) => s.productId === p.productId)?.stock ?? 0;
    days.forEach((d, i) => {
      const made = daily.production.filter((x) => x.date === d && x.productId === p.productId);
      running +=
        made.reduce((a, x) => a + x.produced - x.rejected, 0) -
        daily.dispatch.filter((x) => x.date === d && x.productId === p.productId).reduce((a, x) => a + x.qty, 0) +
        daily.adjustments.filter((x) => x.date === d && x.productId === p.productId).reduce((a, x) => a + x.qty, 0);
      yardSeries[i][`p${p.productId}`] = running;
    });
  }

  /* Inbound per material per day (tonnes) */
  const inboundSeries = days.map((d) => {
    const row: Record<string, number | string> = { date: d };
    for (const m of materials) {
      row[`m${m.materialId}`] = round2(
        daily.inbound.filter((x) => x.date === d && x.materialId === m.materialId).reduce((a, x) => a + x.kg, 0) / 1000,
      );
    }
    return row;
  });

  /* Money */
  const monthlySeries = months.map((m) => ({
    month: m,
    billed: monthly.billed.find((x) => x.month === m)?.amount ?? 0,
    collected: monthly.collected.find((x) => x.month === m)?.amount ?? 0,
  }));
  const open = invoices.filter((i) => !i.cancelled);
  const receivable = balances.reduce((a, c) => a + Math.max(c.outstanding, 0), 0);
  const ageing = ageingBuckets(
    open.map((i) => ({ invoiceDate: i.invoiceDate, balance: i.balance })),
    today,
  );
  // Opening balances from before the app aren't tied to invoices: count them as the oldest bucket.
  const openingDue = balances.reduce((a, c) => a + Math.max(Math.min(c.openingBalance, c.outstanding), 0), 0);
  if (openingDue > 0) ageing[3] = { ...ageing[3], amount: round2(ageing[3].amount + openingDue) };

  const topOwing = balances
    .filter((c) => c.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.firmName ?? c.name, amount: c.outstanding }));
  const topPending = balances
    .filter((c) => c.pending > 0)
    .sort((a, b) => b.pending - a.pending)
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.firmName ?? c.name, pending: c.pending, ordered: c.ordered, delivered: c.delivered }));

  /* KPIs */
  const sumBy = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
  const kpis = {
    todayProduction: products.map((p) => ({
      productId: p.productId,
      name: p.name,
      code: p.code,
      capacity: p.dailyCapacity,
      made: sumBy(todayData.production.filter((x) => x.date === today && x.productId === p.productId), (x) => x.produced),
      sent: sumBy(todayData.dispatch.filter((x) => x.date === today && x.productId === p.productId), (x) => x.qty),
      monthMade: sumBy(monthData.production.filter((x) => x.productId === p.productId), (x) => x.produced),
      monthDays: new Set(monthData.production.filter((x) => x.productId === p.productId).map((x) => x.date)).size,
      inYard: p.stock,
    })),
    todayInbound: materials.map((m) => ({
      materialId: m.materialId,
      name: m.name,
      code: m.code,
      kg: sumBy(todayData.inbound.filter((x) => x.date === today && x.materialId === m.materialId), (x) => x.kg),
    })),
    rangeProduced: sumBy(daily.production, (x) => x.produced),
    rangeSent: sumBy(daily.dispatch, (x) => x.qty),
    pendingDeliveries: sumBy(open, (i) => i.pending),
    receivable,
    collectedThisMonth: monthlySeries.at(-1)?.collected ?? 0,
    billedThisMonth: monthlySeries.at(-1)?.billed ?? 0,
    overdueCount: open.filter((i) => i.paymentStatus === "overdue").length,
    overdueAmount: sumBy(open.filter((i) => i.paymentStatus === "overdue"), (i) => i.balance),
  };

  return {
    kpis,
    products: products.map((p) => ({ productId: p.productId, name: p.name, code: p.code })),
    materials,
    productionSeries,
    yardSeries,
    inboundSeries,
    monthlySeries,
    ageing,
    topOwing,
    topPending,
    lowStock: materials.filter((m) => m.low || (m.daysLeft !== null && m.daysLeft <= 3)),
    overdue: open
      .filter((i) => i.paymentStatus === "overdue")
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5)
      .map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, customer: i.firmName ?? i.customerName, balance: i.balance, dueDate: i.dueDate })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

/* Reports -------------------------------------------------------------- */

async function loadGstSummary(from: string, to: string) {
  "use cache";
  cacheTag(TAG.invoices, TAG.customers);
  cacheLife("live");
  const rows = await db.execute<{
    m: string;
    invoices: number;
    taxable: string;
    cgst: string;
    sgst: string;
    igst: string;
    total: string;
    b2b: number;
  }>(sql`
    select to_char(i.invoice_date, 'YYYY-MM') as m, count(*)::int as invoices,
      sum(i.subtotal + i.transport_charges) as taxable, sum(i.cgst) as cgst, sum(i.sgst) as sgst, sum(i.igst) as igst,
      sum(i.total) as total, count(*) filter (where c.gstin is not null)::int as b2b
    from invoices i join customers c on c.id = i.customer_id
    where i.status = 'active' and i.invoice_date between ${from} and ${to}
    group by 1 order by 1`);
  return rows.map((r) => ({
    month: r.m,
    invoices: r.invoices,
    b2b: r.b2b,
    taxable: num(r.taxable),
    cgst: num(r.cgst),
    sgst: num(r.sgst),
    igst: num(r.igst),
    total: num(r.total),
  }));
}

export async function getReports(from: string, to: string) {
  await requireOwner();
  const [daily, gst, stock] = await Promise.all([loadDaily(from, to), loadGstSummary(from, to), stockUnchecked(to)]);
  const days = dateRange(from, to).reverse();
  const products = stock.finished;
  const materials = stock.raw;
  const register = days.map((d) => ({
    date: d,
    made: Object.fromEntries(
      products.map((p) => [p.productId, daily.production.filter((x) => x.date === d && x.productId === p.productId).reduce((a, x) => a + x.produced, 0)]),
    ) as Record<number, number>,
    broken: daily.production.filter((x) => x.date === d).reduce((a, x) => a + x.rejected, 0),
    sent: Object.fromEntries(
      products.map((p) => [p.productId, daily.dispatch.filter((x) => x.date === d && x.productId === p.productId).reduce((a, x) => a + x.qty, 0)]),
    ) as Record<number, number>,
    inbound: Object.fromEntries(
      materials.map((m) => [m.materialId, daily.inbound.filter((x) => x.date === d && x.materialId === m.materialId).reduce((a, x) => a + x.kg, 0)]),
    ) as Record<number, number>,
  }));
  return {
    products: products.map((p) => ({ id: p.productId, name: p.name, code: p.code })),
    materials: materials.map((m) => ({ id: m.materialId, name: m.name, code: m.code })),
    register,
    gst,
  };
}
