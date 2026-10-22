import type { Metadata } from "next";
import { Suspense } from "react";
import { IndianRupee, Truck, Users } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { StatCard } from "@/components/common/stat-card";
import { getCurrentUser } from "@/lib/auth";
import { formatINRCompact, formatNumber } from "@/lib/format";
import { today } from "@/lib/today";
import { getCustomerBalances, getCustomerDirectory } from "@/server/queries/customers";
import { getCustomersWithPending } from "@/server/queries/invoices";
import { CustomerTable, type CustomerRow } from "./customer-table";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who buys bricks: contact details, orders and what's still to deliver."
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <StatGridSkeleton count={3} />
            <ListSkeleton />
          </div>
        }
      >
        <CustomersContent />
      </Suspense>
    </>
  );
}

async function CustomersContent() {
  const [user, t, directory] = await Promise.all([getCurrentUser(), today(), getCustomerDirectory()]);

  if (user.role !== "owner") {
    const pendingList = await getCustomersWithPending(t);
    const pending = new Map(pendingList.map((p) => [p.customerId, p]));
    const rows: CustomerRow[] = directory.map((c) => ({ ...c, pending: pending.get(c.id)?.pending ?? 0, openOrders: pending.get(c.id)?.invoices ?? 0 }));
    return <CustomerTable customers={rows} showMoney={false} />;
  }

  const balances = await getCustomerBalances();
  const contacts = new Map(directory.map((c) => [c.id, c]));
  const rows: CustomerRow[] = balances.map(({ id, name, firmName, phone, stateName, active, pending, ...account }) => ({
    ...contacts.get(id),
    id,
    name,
    firmName,
    phone,
    stateName,
    active,
    pending,
    account,
  }));
  const receivable = balances.reduce((a, c) => a + Math.max(c.outstanding, 0), 0);
  const advances = balances.reduce((a, c) => a + Math.max(-c.outstanding, 0), 0);
  const pending = balances.reduce((a, c) => a + c.pending, 0);
  const withPending = balances.filter((c) => c.pending > 0).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="To collect"
          value={formatINRCompact(receivable)}
          hint={advances > 0 ? `${formatINRCompact(advances)} held as advance` : `${balances.filter((c) => c.outstanding > 0).length} customers owe money`}
          icon={IndianRupee}
          tone="warning"
        />
        <StatCard
          label="Bricks to deliver"
          value={formatNumber(pending)}
          hint={`${withPending} customer${withPending === 1 ? "" : "s"} waiting`}
          icon={Truck}
          tone="info"
        />
        <StatCard
          label="Customers"
          value={formatNumber(balances.filter((c) => c.active).length)}
          hint={`${balances.filter((c) => !c.active).length} archived`}
          icon={Users}
          className="col-span-2 lg:col-span-1"
        />
      </div>
      <CustomerTable customers={rows} showMoney />
    </div>
  );
}
