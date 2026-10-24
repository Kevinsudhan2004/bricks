/**
 * Seed the database.
 *   npm run db:seed        → company profile, products, materials, mix and the two logins
 *   npm run db:seed:demo   → the above + ~75 days of realistic demo activity (for trying the app)
 *   SEED_DEMO_TRUCKS=true  → also add the demo trucks (a week of GPS history) if they aren't there yet
 *
 * Safe to re-run: base data is upserted, demo data is skipped if invoices already exist.
 */
import bcrypt from "bcryptjs";
import { eq, inArray, sql } from "drizzle-orm";
import { addDays, daysBetween, DEFAULT_TZ, financialYear, todayIn } from "../domain/dates";
import { DOC_PREFIX, formatDocNo } from "../domain/doc-numbers";
import { computeInvoiceTotals } from "../domain/invoice";
import { round2 } from "../domain/money";
import { DEMO_TRUCK_PLATES, seedDemoTrucks } from "./demo-trucks";
import * as s from "./schema";
import { connect, isLocalDatabase } from "./script-db";

const { client, db } = connect();
type Db = typeof db;

/* ------------------------------------------------------------------ */
/* Base data                                                           */
/* ------------------------------------------------------------------ */

async function seedBase() {
  await db
    .insert(s.companySettings)
    .values({
      id: 1,
      name: "Your Brick Company",
      tagline: "Fly Ash Bricks & Solid Blocks",
      address: "Factory address, Town, District – PIN",
      phone: "",
      stateName: "Tamil Nadu",
      stateCode: "33",
      invoiceTerms:
        "1. Goods once sold will not be taken back.\n2. Breakage during unloading at site is the buyer's responsibility.\n3. Interest @18% p.a. will be charged on overdue payments.",
      defaultDueDays: 15,
    })
    .onConflictDoNothing();

  await db
    .insert(s.products)
    .values([
      {
        name: "Fly Ash Bricks",
        code: "FLYASH",
        size: "230 × 110 × 75 mm (9″ × 4″ × 3″)",
        dailyCapacity: 25000,
        defaultRate: 8,
        hsnCode: "6815",
        gstRate: 5,
        sortOrder: 1,
      },
      {
        name: "Solid Blocks",
        code: "SOLID",
        size: "400 × 200 × 150 mm (6″)",
        dailyCapacity: 8000,
        defaultRate: 45,
        hsnCode: "6810",
        gstRate: 18,
        sortOrder: 2,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.materials)
    .values([
      { name: "Fly Ash", code: "FLYASH", lowStockKg: 60000, sortOrder: 1 },
      { name: "Cement", code: "CEMENT", lowStockKg: 15000, sortOrder: 2 },
      { name: "M Sand", code: "MSAND", lowStockKg: 120000, sortOrder: 3 },
    ])
    .onConflictDoNothing();

  const prods = await db.select().from(s.products);
  const mats = await db.select().from(s.materials);
  const p = (code: string) => prods.find((x) => x.code === code)!.id;
  const m = (code: string) => mats.find((x) => x.code === code)!.id;

  // Default mix (kg per brick/block). Placeholders – the owner should set the real mix in Settings.
  await db
    .insert(s.productRecipes)
    .values([
      { productId: p("FLYASH"), materialId: m("FLYASH"), kgPerUnit: 1.5 },
      { productId: p("FLYASH"), materialId: m("CEMENT"), kgPerUnit: 0.25 },
      { productId: p("FLYASH"), materialId: m("MSAND"), kgPerUnit: 1.0 },
      { productId: p("SOLID"), materialId: m("FLYASH"), kgPerUnit: 4.0 },
      { productId: p("SOLID"), materialId: m("CEMENT"), kgPerUnit: 1.8 },
      { productId: p("SOLID"), materialId: m("MSAND"), kgPerUnit: 16.0 },
    ])
    .onConflictDoNothing();

  const ownerUser = process.env.SEED_OWNER_USERNAME || "owner";
  const ownerPass = process.env.SEED_OWNER_PASSWORD || "change-me-owner";
  const empUser = process.env.SEED_EMPLOYEE_USERNAME || "employee";
  const empPass = process.env.SEED_EMPLOYEE_PASSWORD || "change-me-employee";
  // The default passwords are published in the repo; never create them on a hosted database.
  if (!isLocalDatabase() && [ownerPass, empPass].some((p) => p.startsWith("change-me"))) {
    throw new Error("Set SEED_OWNER_PASSWORD and SEED_EMPLOYEE_PASSWORD to real passwords before seeding a hosted database.");
  }

  await db
    .insert(s.users)
    .values([
      { name: "Owner", username: ownerUser, role: "owner", passwordHash: await bcrypt.hash(ownerPass, 10) },
      { name: "Data Entry", username: empUser, role: "employee", passwordHash: await bcrypt.hash(empPass, 10) },
    ])
    .onConflictDoNothing();

  console.log(`✓ Base data ready. Logins: "${ownerUser}" (owner) and "${empUser}" (employee).`);
}

/* ------------------------------------------------------------------ */
/* Demo data                                                           */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261009);
const between = (a: number, b: number) => a + rnd() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const pick = <T,>(arr: readonly T[]): T => arr[int(0, arr.length - 1)];
const chance = (p: number) => rnd() < p;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const at = (date: string, h = int(8, 18), mi = int(0, 59)) =>
  new Date(`${date}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00+05:30`);

const counters = new Map<string, number>();
function nextNo(prefix: string, date: string) {
  const key = `${prefix}|${financialYear(date)}`;
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  return formatDocNo(prefix, financialYear(date), n);
}

async function seedDemo(dbx: Db) {
  const [{ count }] = await dbx.select({ count: sql<number>`count(*)::int` }).from(s.invoices);
  if (count > 0) {
    console.log("• Demo data skipped: invoices already exist.");
    return;
  }

  const tz = process.env.APP_TIMEZONE || DEFAULT_TZ;
  const today = todayIn(tz);
  const start = addDays(today, -74);
  const company = (await dbx.select().from(s.companySettings).where(eq(s.companySettings.id, 1)))[0];
  const owner = (await dbx.select().from(s.users).where(eq(s.users.role, "owner")))[0];
  const employee = (await dbx.select().from(s.users).where(eq(s.users.role, "employee")))[0];
  const prods = await dbx.select().from(s.products);
  const mats = await dbx.select().from(s.materials);
  const recipes = await dbx.select().from(s.productRecipes);
  const FLY = prods.find((x) => x.code === "FLYASH")!;
  const SOLID = prods.find((x) => x.code === "SOLID")!;
  const MAT = Object.fromEntries(mats.map((x) => [x.code, x])) as Record<string, (typeof mats)[number]>;

  const suppliers = await dbx
    .insert(s.suppliers)
    .values([
      { name: "Royal Fly Ash Suppliers", phone: "9840012345", address: "Near Thermal Power Station" },
      { name: "Sri Balaji Cement Agencies", phone: "9843098765", gstin: "33ABCDE1234F1Z5" },
      { name: "Kaveri M-Sand Quarry", phone: "9790055511", address: "Quarry Road" },
      { name: "Annamalai Transports & Sand", phone: "9894477722" },
    ])
    .returning();
  const supplierFor: Record<string, number[]> = {
    FLYASH: [suppliers[0].id],
    CEMENT: [suppliers[1].id],
    MSAND: [suppliers[2].id, suppliers[3].id],
  };

  const customerSeed = [
    { name: "Murugan", firmName: "Sri Murugan Constructions", phone: "9840111222", pay: 0.32, state: "Tamil Nadu" },
    { name: "Lakshmi Narayanan", firmName: "Lakshmi Builders", phone: "9841222333", pay: 0.26, state: "Tamil Nadu" },
    { name: "R. Karthik", firmName: null, phone: "9884333444", pay: 0.35, state: "Tamil Nadu" },
    { name: "Suresh Kumar", firmName: "Green Valley Developers", phone: "9962444555", pay: 0.2, state: "Tamil Nadu" },
    { name: "Sai Ram", firmName: "Sai Ram Contractors", phone: "9789555666", pay: 0.04, state: "Tamil Nadu" },
    { name: "Annai Homes", firmName: "Annai Homes Pvt Ltd", phone: "9600666777", pay: 0.3, state: "Tamil Nadu" },
    { name: "Ravi Kumar", firmName: "Kumar & Sons Builders", phone: "9677777888", pay: 0.06, state: "Tamil Nadu" },
    { name: "Prakash Rao", firmName: "Bengaluru Prime Builders", phone: "9845888999", pay: 0.24, state: "Karnataka" },
  ];
  const customers = await dbx
    .insert(s.customers)
    .values(
      customerSeed.map((c, i) => ({
        name: c.name,
        firmName: c.firmName,
        phone: c.phone,
        stateName: c.state,
        gstin: c.firmName ? `${c.state === "Karnataka" ? "29" : "33"}AAAC${String(1000 + i * 7)}B1Z${i}` : null,
        billingAddress: `${int(1, 200)}, Main Road, ${pick(["Salem", "Erode", "Namakkal", "Coimbatore", "Hosur"])}`,
        siteAddress: `Site: Plot ${int(1, 90)}, ${pick(["Nagar", "Layout", "Colony", "Extension"])}`,
        openingBalance: i === 1 ? 25000 : i === 4 ? 48000 : 0,
        createdBy: owner.id,
        createdAt: at(start, 9),
      })),
    )
    .returning();

  const vehicles = [
    "TN 30 AB 1234", "TN 28 BC 4521", "TN 52 CD 7788", "TN 33 DE 9012", "TN 30 EF 3456",
    "TN 77 FG 6543", "TN 30 GH 2468", "TN 34 HJ 1357", "KA 01 JK 8080", "TN 30 KL 5050",
  ];
  const drivers = ["Selvam", "Muthu", "Ganesan", "Raja", "Arjun", "Mani", "Kannan", "Velu"];

  // Opening stock so the yard isn't empty on day one
  await dbx.insert(s.stockAdjustments).values([
    { adjDate: start, itemType: "material", materialId: MAT.FLYASH.id, quantity: 120000, reason: "Opening stock", createdBy: owner.id },
    { adjDate: start, itemType: "material", materialId: MAT.CEMENT.id, quantity: 40000, reason: "Opening stock", createdBy: owner.id },
    { adjDate: start, itemType: "material", materialId: MAT.MSAND.id, quantity: 250000, reason: "Opening stock", createdBy: owner.id },
    { adjDate: start, itemType: "product", productId: FLY.id, quantity: 30000, reason: "Opening stock", createdBy: owner.id },
    { adjDate: start, itemType: "product", productId: SOLID.id, quantity: 6000, reason: "Opening stock", createdBy: owner.id },
  ]);

  const fgStock = new Map<number, number>([
    [FLY.id, 30000],
    [SOLID.id, 6000],
  ]);
  type OpenInvoice = {
    id: number;
    customerIdx: number;
    date: string;
    total: number;
    paid: number;
    pending: Map<number, number>;
    dispatched: boolean;
  };
  const openInvoices: OpenInvoice[] = [];
  const allLoads: { id: number; entryDate: string; supplierId: number | null; materialId: number; netKg: number }[] = [];

  for (let d = start; d <= today; d = addDays(d, 1)) {
    const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    const sunday = weekday === 0;

    /* Production */
    if (!sunday) {
      const slow = chance(0.07) ? between(0.4, 0.6) : 1;
      const isToday = d === today;
      const dayShare = isToday ? 0.55 : 1;
      const flyQty = roundTo(between(17500, 24800) * slow * dayShare, 50);
      const solidQty = roundTo(between(3000, 5200) * slow * dayShare, 50);
      const rows = [
        { product: FLY, produced: flyQty, rejected: Math.round(flyQty * between(0.005, 0.018)) },
        { product: SOLID, produced: solidQty, rejected: Math.round(solidQty * between(0.003, 0.012)) },
      ];
      await dbx.insert(s.productionEntries).values(
        rows.map((r) => ({
          entryDate: d,
          productId: r.product.id,
          shift: "day",
          quantityProduced: r.produced,
          quantityRejected: r.rejected,
          remarks: slow < 1 ? "Machine maintenance – reduced output" : null,
          createdBy: employee.id,
          createdAt: at(d, 18, int(0, 50)),
        })),
      );
      for (const r of rows) fgStock.set(r.product.id, (fgStock.get(r.product.id) ?? 0) + r.produced - r.rejected);

      /* Inbound: roughly replace what was consumed */
      const loadSize: Record<string, [number, number]> = {
        FLYASH: [18000, 32000],
        CEMENT: [10000, 20000],
        MSAND: [22000, 36000],
      };
      const inboundRows: (typeof s.inboundEntries.$inferInsert)[] = [];
      for (const mat of mats) {
        const consumed = rows.reduce(
          (acc, r) =>
            acc +
            r.produced * (recipes.find((x) => x.productId === r.product.id && x.materialId === mat.id)?.kgPerUnit ?? 0),
          0,
        );
        let need = consumed * between(0.9, 1.06);
        while (need > 4000) {
          const [lo, hi] = loadSize[mat.code];
          const net = roundTo(between(lo, hi), 10);
          const tare = roundTo(between(8500, 12500), 10);
          // Rate and amount come from the supplier bill the load ends up on (below).
          inboundRows.push({
            entryDate: d,
            materialId: mat.id,
            supplierId: pick(supplierFor[mat.code]),
            vehicleNo: pick(vehicles),
            challanNo: `CH-${int(1000, 9999)}`,
            grossKg: net + tare,
            tareKg: tare,
            netKg: net,
            createdBy: employee.id,
            createdAt: at(d, int(7, 16)),
          });
          need -= net;
        }
      }
      if (inboundRows.length) {
        allLoads.push(
          ...(await dbx.insert(s.inboundEntries).values(inboundRows).returning({
            id: s.inboundEntries.id,
            entryDate: s.inboundEntries.entryDate,
            supplierId: s.inboundEntries.supplierId,
            materialId: s.inboundEntries.materialId,
            netKg: s.inboundEntries.netKg,
          })),
        );
      }
    }

    /* New invoices */
    const invoiceCount = sunday ? 0 : pick([0, 1, 1, 1, 2, 2, 3]);
    for (let k = 0; k < invoiceCount; k++) {
      const ci = int(0, customers.length - 1);
      const cust = customers[ci];
      const items: { productId: number; quantity: number; rate: number; gstRate: number }[] = [];
      if (chance(0.85)) {
        items.push({
          productId: FLY.id,
          quantity: pick([8000, 10000, 12000, 15000, 20000, 25000, 30000]),
          rate: pick([7.5, 7.75, 8, 8, 8.25, 8.5]),
          gstRate: FLY.gstRate,
        });
      }
      if (items.length === 0 || chance(0.6)) {
        items.push({
          productId: SOLID.id,
          quantity: pick([2000, 3000, 4000, 5000, 6000, 8000]),
          rate: pick([42, 44, 45, 45, 46, 48]),
          gstRate: SOLID.gstRate,
        });
      }
      const taxType = cust.stateName && cust.stateName !== company.stateName ? "inter" : "intra";
      const transport = chance(0.5) ? roundTo(between(1500, 6000), 500) : 0;
      const totals = computeInvoiceTotals({ items, transportCharges: transport, taxType });
      const [inv] = await dbx
        .insert(s.invoices)
        .values({
          invoiceNo: nextNo(DOC_PREFIX.order, d),
          invoiceDate: d,
          dueDate: addDays(d, company.defaultDueDays),
          customerId: cust.id,
          deliveryAddress: cust.siteAddress,
          taxType,
          subtotal: totals.subtotal,
          transportCharges: totals.transportCharges,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          roundOff: totals.roundOff,
          total: totals.total,
          createdBy: owner.id,
          createdAt: at(d, int(9, 12)),
        })
        .returning();
      await dbx.insert(s.invoiceItems).values(
        totals.lines.map((l) => ({
          invoiceId: inv.id,
          productId: l.productId,
          quantity: l.quantity,
          rate: l.rate,
          gstRate: l.gstRate,
          amount: l.amount,
        })),
      );
      openInvoices.push({
        id: inv.id,
        customerIdx: ci,
        date: d,
        total: totals.total,
        paid: 0,
        pending: new Map(items.map((i) => [i.productId, i.quantity])),
        dispatched: false,
      });
    }

    /* Dispatch trucks, oldest invoices first */
    const trucks = sunday ? int(0, 1) : int(8, 13);
    for (let t = 0; t < trucks; t++) {
      const inv = openInvoices.find(
        (o) => o.date <= d && [...o.pending.entries()].some(([pid, q]) => q > 0 && (fgStock.get(pid) ?? 0) > 0),
      );
      if (!inv) break;
      const pendingProducts = [...inv.pending.entries()].filter(([pid, q]) => q > 0 && (fgStock.get(pid) ?? 0) > 0);
      const both = pendingProducts.length > 1;
      const lines = pendingProducts
        .map(([pid, q]) => {
          const cap = pid === FLY.id ? pick([2500, 3000, 3500, 4000]) : pick([800, 1000, 1200, 1500]);
          const qty = Math.min(q, both ? Math.round(cap / 2) : cap, fgStock.get(pid) ?? 0);
          return { productId: pid, quantity: qty };
        })
        .filter((l) => l.quantity > 0);
      if (!lines.length) continue;
      const cust = customers[inv.customerIdx];
      const [dc] = await dbx
        .insert(s.dispatches)
        .values({
          dispatchNo: nextNo(DOC_PREFIX.dispatch, d),
          dispatchDate: d,
          customerId: cust.id,
          invoiceId: inv.id,
          vehicleNo: pick(vehicles),
          driverName: pick(drivers),
          driverPhone: `9${int(100000000, 999999999)}`,
          createdBy: employee.id,
          createdAt: at(d, int(8, 17)),
        })
        .returning();
      await dbx.insert(s.dispatchItems).values(lines.map((l) => ({ dispatchId: dc.id, ...l })));
      for (const l of lines) {
        inv.pending.set(l.productId, (inv.pending.get(l.productId) ?? 0) - l.quantity);
        fgStock.set(l.productId, (fgStock.get(l.productId) ?? 0) - l.quantity);
      }
      inv.dispatched = true;
    }

    /* Customer payments */
    for (let ci = 0; ci < customers.length; ci++) {
      if (sunday || !chance(Math.min(customerSeed[ci].pay * 1.7, 0.6))) continue;
      const inv = openInvoices.find((o) => o.customerIdx === ci && o.dispatched && o.paid < o.total && o.date < d);
      if (!inv) continue;
      const balance = inv.total - inv.paid;
      const share = pick([0.5, 1, 1, 1]);
      const amount = share === 1 ? balance : Math.min(balance, roundTo(balance * share, 1000) || balance);
      inv.paid = round2(inv.paid + amount);
      const mode = pick(["upi", "bank", "bank", "cash", "cheque"] as const);
      await dbx.insert(s.payments).values({
        receiptNo: nextNo(DOC_PREFIX.receipt, d),
        paymentDate: d,
        customerId: customers[ci].id,
        invoiceId: inv.id,
        amount,
        mode,
        reference: mode === "cheque" ? `CHQ ${int(100000, 999999)}` : mode === "cash" ? null : `UTR${int(10000000, 99999999)}`,
        createdBy: owner.id,
        createdAt: at(d, int(10, 18)),
      });
    }
  }

  // An advance from a regular customer (not tied to an invoice)
  await dbx.insert(s.payments).values({
    receiptNo: nextNo(DOC_PREFIX.receipt, addDays(today, -3)),
    paymentDate: addDays(today, -3),
    customerId: customers[2].id,
    amount: 20000,
    mode: "upi",
    reference: `UTR${int(10000000, 99999999)}`,
    remarks: "Advance for next order",
    createdBy: owner.id,
  });

  // A few credit / debit notes
  const withDispatch = openInvoices.filter((o) => o.dispatched);
  const noteNet = new Map<number, number>(); // order id → debit notes − credit notes
  for (let k = 0; k < 3; k++) {
    const inv = pick(withDispatch);
    const date = addDays(inv.date, int(2, 6)) > today ? today : addDays(inv.date, int(2, 6));
    const amount = roundTo(between(1200, 6000), 100);
    noteNet.set(inv.id, (noteNet.get(inv.id) ?? 0) - amount);
    await dbx.insert(s.adjustmentNotes).values({
      noteNo: nextNo(DOC_PREFIX.creditNote, date),
      type: "credit",
      noteDate: date,
      customerId: customers[inv.customerIdx].id,
      invoiceId: inv.id,
      amount,
      reason: "damaged",
      description: `${int(150, 600)} bricks damaged in transit`,
      createdBy: owner.id,
    });
  }
  for (let k = 0; k < 2; k++) {
    const inv = pick(withDispatch);
    const date = addDays(inv.date, int(1, 4)) > today ? today : addDays(inv.date, int(1, 4));
    const amount = roundTo(between(1000, 3000), 100);
    noteNet.set(inv.id, (noteNet.get(inv.id) ?? 0) + amount);
    await dbx.insert(s.adjustmentNotes).values({
      noteNo: nextNo(DOC_PREFIX.debitNote, date),
      type: "debit",
      noteDate: date,
      customerId: customers[inv.customerIdx].id,
      invoiceId: inv.id,
      amount,
      reason: "transport",
      description: "Extra trip to second site",
      createdBy: owner.id,
    });
  }

  // Older orders that were fully delivered and settled have been marked completed by the owner;
  // recent settled ones are left for the "Ready to complete" list.
  let completed = 0;
  for (const inv of openInvoices) {
    const delivered = [...inv.pending.values()].every((q) => q === 0);
    const balance = round2(inv.total + (noteNet.get(inv.id) ?? 0) - inv.paid);
    if (!delivered || balance !== 0 || inv.date > addDays(today, -25)) continue;
    await dbx.update(s.invoices).set({ closedAt: at(addDays(inv.date, 20), 19), closedBy: owner.id }).where(eq(s.invoices.id, inv.id));
    completed++;
  }

  /* Raw material bills: each supplier bills every 15 days; the last 10 days of loads aren't billed yet. */
  const RATE: Record<string, number> = { FLYASH: 650, CEMENT: 7100, MSAND: 980 };
  const GST: Record<string, number> = { FLYASH: 5, CEMENT: 18, MSAND: 5 };
  const billCutoff = addDays(today, -10);
  let bills = 0;
  for (const [si, sup] of suppliers.entries()) {
    const mine = allLoads.filter((l) => l.supplierId === sup.id && l.entryDate <= billCutoff);
    let first = true;
    for (let from = start; from <= billCutoff; from = addDays(from, 15)) {
      const to = addDays(from, 14) < billCutoff ? addDays(from, 14) : billCutoff;
      const loads = mine.filter((l) => l.entryDate >= from && l.entryDate <= to);
      if (!loads.length) continue;
      const billDate = addDays(to, 1);
      const kgByMaterial = new Map<number, number>();
      for (const l of loads) kgByMaterial.set(l.materialId, (kgByMaterial.get(l.materialId) ?? 0) + l.netKg);
      const items = [...kgByMaterial].map(([materialId, kg]) => {
        const code = mats.find((x) => x.id === materialId)!.code;
        return { productId: materialId, quantity: Math.round(kg) / 1000, rate: RATE[code] + si * 20, gstRate: GST[code] };
      });
      const totals = computeInvoiceTotals({ items, transportCharges: 0, taxType: "intra" });
      const [bill] = await dbx
        .insert(s.purchaseBills)
        .values({
          billNo: nextNo(DOC_PREFIX.purchaseBill, billDate),
          supplierBillNo: `${sup.name.slice(0, 3).toUpperCase()}/${int(100, 999)}`,
          billDate,
          dueDate: addDays(billDate, 30),
          supplierId: sup.id,
          taxType: "intra",
          subtotal: totals.subtotal,
          cgst: totals.cgst,
          sgst: totals.sgst,
          roundOff: totals.roundOff,
          total: totals.total,
          createdBy: owner.id,
          createdAt: at(billDate, 11),
        })
        .returning({ id: s.purchaseBills.id });
      bills++;
      await dbx.insert(s.purchaseBillItems).values(
        totals.lines.map((l) => ({
          billId: bill.id,
          materialId: l.productId,
          quantityKg: round2(l.quantity * 1000),
          ratePerTon: l.rate,
          gstRate: l.gstRate,
          amount: l.amount,
        })),
      );
      for (const line of totals.lines) {
        const ids = loads.filter((l) => l.materialId === line.productId).map((l) => l.id);
        await dbx
          .update(s.inboundEntries)
          .set({ purchaseBillId: bill.id, ratePerTon: line.rate, amount: sql`round(${s.inboundEntries.netKg} / 1000 * ${line.rate}, 2)` })
          .where(inArray(s.inboundEntries.id, ids));
      }

      // The first fly ash bill had a short-weight credit from the supplier; we paid the rest.
      let credit = 0;
      if (first && si === 0) {
        credit = 1500;
        await dbx.insert(s.supplierNotes).values({
          noteNo: nextNo(DOC_PREFIX.supplierCredit, addDays(billDate, 2)),
          type: "credit",
          noteDate: addDays(billDate, 2),
          supplierId: sup.id,
          billId: bill.id,
          amount: credit,
          reason: "short_weight",
          description: "Weighbridge showed 2.1 t less on two loads",
          createdBy: owner.id,
        });
      }
      first = false;

      // Older bills are paid in full (and closed once settled for a while); newer ones part-paid or not yet.
      const age = daysBetween(billDate, today);
      const due = round2(totals.total - credit);
      const paid = age > 30 ? due : age > 18 ? roundTo(due * 0.5, 1000) : 0;
      if (paid > 0) {
        const payDate = addDays(billDate, age > 30 ? int(20, 28) : int(5, 10));
        await dbx.insert(s.supplierPayments).values({
          voucherNo: nextNo(DOC_PREFIX.supplierPayment, payDate),
          paymentDate: payDate,
          supplierId: sup.id,
          billId: bill.id,
          amount: paid,
          mode: pick(["bank", "bank", "upi", "cheque"] as const),
          reference: `UTR${int(10000000, 99999999)}`,
          createdBy: owner.id,
          createdAt: at(payDate, 15),
        });
      }
      if (paid === due && age > 45) {
        await dbx.update(s.purchaseBills).set({ closedAt: at(addDays(billDate, 32), 18), closedBy: owner.id }).where(eq(s.purchaseBills.id, bill.id));
      }
    }
  }
  // An extra unloading charge on the newest M sand bill
  const [lastSand] = await dbx
    .select({ id: s.purchaseBills.id, supplierId: s.purchaseBills.supplierId, billDate: s.purchaseBills.billDate })
    .from(s.purchaseBills)
    .where(eq(s.purchaseBills.supplierId, suppliers[2].id))
    .orderBy(sql`${s.purchaseBills.billDate} desc`)
    .limit(1);
  if (lastSand) {
    await dbx.insert(s.supplierNotes).values({
      noteNo: nextNo(DOC_PREFIX.supplierDebit, lastSand.billDate),
      type: "debit",
      noteDate: lastSand.billDate,
      supplierId: lastSand.supplierId,
      billId: lastSand.id,
      amount: 2500,
      reason: "transport",
      description: "JCB unloading charges",
      createdBy: owner.id,
    });
  }

  for (const [key, value] of counters) {
    const [prefix, fy] = key.split("|");
    await dbx
      .insert(s.docCounters)
      .values({ prefix, fy, lastValue: value })
      .onConflictDoUpdate({ target: [s.docCounters.prefix, s.docCounters.fy], set: { lastValue: value } });
  }

  console.log(
    `✓ Demo data: ${customers.length} customers, ${openInvoices.length} orders (${completed} completed), ${bills} supplier bills, ${start} → ${today}.`,
  );
}

async function main() {
  await seedBase();
  const demo = process.argv.includes("--demo");
  if (demo) await db.transaction(async (tx) => seedDemo(tx as unknown as Db));
  // The trucks alone can be turned on for a hosted database (netlify.toml) to show tracking without demo sales.
  if (demo || process.env.SEED_DEMO_TRUCKS === "true") {
    // Keyed on the demo plates, so they're added once even when real trucks already exist.
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.trucks)
      .where(inArray(s.trucks.plateNo, DEMO_TRUCK_PLATES));
    if (n === 0) {
      const r = await seedDemoTrucks(db);
      console.log(`✓ Demo trucks: ${r.trucks} trucks, ${r.points.toLocaleString("en-IN")} GPS points.`);
    } else {
      console.log("• Demo trucks skipped: they're already there.");
    }
  }
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});
