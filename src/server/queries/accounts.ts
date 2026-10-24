import "server-only";
import { round2 } from "@/domain/money";
import { requireOwner } from "@/lib/auth";
import { customerBalancesUnchecked } from "./customers";
import { invoiceSummariesUnchecked } from "./invoices";
import { loadMastersUnchecked } from "./masters";
import { billSummariesUnchecked, supplierBalancesUnchecked } from "./purchases";

/*
 * One list of everyone the business has money with: customers (who owe us for bricks) and
 * suppliers (whom we owe for raw material). An advance flips the side: an advance a customer paid
 * is owed back to them in bricks, an advance we paid a supplier is owed to us in material.
 */

export type AccountRow = {
  /** "c-12" / "s-3": unique across both lists. */
  key: string;
  kind: "customer" | "supplier";
  id: number;
  name: string;
  /** The person behind a firm name. */
  contact: string | null;
  phone: string | null;
  active: boolean;
  openingBalance: number;
  /** Order / bill totals. */
  billed: number;
  /** Debit notes (customers) or extra charges (suppliers). */
  extra: number;
  /** Payments received from a customer, or paid to a supplier. */
  paid: number;
  /** Credit notes given to a customer, or credits a supplier gave us. */
  credits: number;
  theyOwe: number;
  weOwe: number;
  /** Ongoing orders / bills, and how many of them are ready to complete or close. */
  ongoing: number;
  ready: number;
  overdue: number;
  lastActivity: string | null;
};

export async function accountsUnchecked(today: string): Promise<AccountRow[]> {
  const [customers, suppliers, masters, orders, bills] = await Promise.all([
    customerBalancesUnchecked(),
    supplierBalancesUnchecked(),
    loadMastersUnchecked(),
    invoiceSummariesUnchecked({}, today),
    billSummariesUnchecked({}, today),
  ]);

  const perParty = <T extends { state: string; readyToClose: boolean; paymentStatus: string; balance: number }>(list: T[], key: (x: T) => number) => {
    const map = new Map<number, { ongoing: number; ready: number; overdue: number }>();
    for (const x of list) {
      if (x.state !== "ongoing") continue;
      const m = map.get(key(x)) ?? { ongoing: 0, ready: 0, overdue: 0 };
      m.ongoing += 1;
      if (x.readyToClose) m.ready += 1;
      if (x.paymentStatus === "overdue") m.overdue = round2(m.overdue + x.balance);
      map.set(key(x), m);
    }
    return map;
  };
  const orderStats = perParty(orders, (o) => o.customerId);
  const billStats = perParty(bills, (b) => b.supplierId);
  const empty = { ongoing: 0, ready: 0, overdue: 0 };

  const rows: AccountRow[] = [
    ...customers.map((c) => ({
      key: `c-${c.id}`,
      kind: "customer" as const,
      id: c.id,
      name: c.firmName ?? c.name,
      contact: c.firmName ? c.name : null,
      phone: c.phone,
      active: c.active,
      openingBalance: c.openingBalance,
      billed: c.billed,
      extra: c.debits,
      paid: c.paid,
      credits: c.credits,
      theyOwe: Math.max(c.outstanding, 0),
      weOwe: Math.max(-c.outstanding, 0),
      ...(orderStats.get(c.id) ?? empty),
      lastActivity: c.lastActivity,
    })),
    ...suppliers.map((b) => {
      const s = masters.suppliers.find((x) => x.id === b.supplierId);
      return {
        key: `s-${b.supplierId}`,
        kind: "supplier" as const,
        id: b.supplierId,
        name: s?.name ?? `Supplier #${b.supplierId}`,
        contact: null,
        phone: s?.phone ?? null,
        active: s?.active ?? true,
        openingBalance: b.openingBalance,
        billed: b.billed,
        extra: b.debits,
        paid: b.paid,
        credits: b.credits,
        theyOwe: Math.max(-b.payable, 0),
        weOwe: Math.max(b.payable, 0),
        ...(billStats.get(b.supplierId) ?? empty),
        lastActivity: b.lastActivity,
      };
    }),
  ];

  // Hidden / archived parties only matter while money is still open with them.
  return rows
    .filter((r) => r.active || r.theyOwe > 0 || r.weOwe > 0)
    .sort((a, b) => Math.max(b.theyOwe, b.weOwe) - Math.max(a.theyOwe, a.weOwe) || a.name.localeCompare(b.name));
}

export async function getAccounts(today: string) {
  await requireOwner();
  return accountsUnchecked(today);
}
