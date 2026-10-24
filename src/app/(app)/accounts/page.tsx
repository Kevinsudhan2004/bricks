import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChipFilter } from "@/components/common/range-filter";
import { ListSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { StatCard } from "@/components/common/stat-card";
import { round2 } from "@/domain/money";
import { requireOwner } from "@/lib/auth";
import { formatINRCompact, formatNumber } from "@/lib/format";
import { flatParams, strParam, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { getAccounts, type AccountRow } from "@/server/queries/accounts";
import { AccountsTable } from "./accounts-table";

export const metadata: Metadata = { title: "Accounts" };

const SHOW: Record<string, { label: string; test: (r: AccountRow) => boolean }> = {
  customers: { label: "Customers", test: (r) => r.kind === "customer" },
  suppliers: { label: "Suppliers", test: (r) => r.kind === "supplier" },
  "owe-you": { label: "They owe you", test: (r) => r.theyOwe > 0 },
  "you-owe": { label: "You owe them", test: (r) => r.weOwe > 0 },
  overdue: { label: "Overdue", test: (r) => r.overdue > 0 },
};

export default function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  return (
    <>
      <PageHeader
        title="Accounts"
        description="Every customer and supplier in one list: what each one owes you and what you owe them."
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <StatGridSkeleton count={4} />
            <ListSkeleton />
          </div>
        }
      >
        <AccountsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AccountsContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const [sp, t] = await Promise.all([searchParams, today()]);
  const all = await getAccounts(t);
  const showKey = strParam(sp, "show");
  const show = showKey ? SHOW[showKey] : undefined;
  const rows = show ? all.filter(show.test) : all;

  // Totals always cover everyone, whatever the filter, so the headline numbers don't jump around.
  const theyOwe = round2(all.reduce((a, r) => a + r.theyOwe, 0));
  const weOwe = round2(all.reduce((a, r) => a + r.weOwe, 0));
  const net = round2(theyOwe - weOwe);
  const overdueRows = all.filter((r) => r.overdue > 0);
  const overdueIn = round2(overdueRows.filter((r) => r.kind === "customer").reduce((a, r) => a + r.overdue, 0));
  const overdueOut = round2(overdueRows.filter((r) => r.kind === "supplier").reduce((a, r) => a + r.overdue, 0));
  const count = (key: string) => all.filter(SHOW[key].test).length;

  return (
    <div className="space-y-4">
      <ChipFilter
        pathname="/accounts"
        params={flatParams(sp)}
        name="show"
        value={show ? showKey : undefined}
        allLabel={`Everyone · ${formatNumber(all.length)}`}
        options={Object.entries(SHOW).map(([value, s]) => ({ value, label: `${s.label} · ${formatNumber(count(value))}` }))}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="They owe you"
          value={formatINRCompact(theyOwe)}
          hint={`${count("owe-you")} accounts · customers and supplier advances`}
          icon={ArrowDownLeft}
          tone="success"
          href="/accounts?show=owe-you"
        />
        <StatCard
          label="You owe them"
          value={formatINRCompact(weOwe)}
          hint={`${count("you-owe")} accounts · suppliers and customer advances`}
          icon={ArrowUpRight}
          tone="warning"
          href="/accounts?show=you-owe"
        />
        <StatCard
          label="Net position"
          value={formatINRCompact(Math.abs(net))}
          hint={net > 0 ? "More coming in than going out" : net < 0 ? "You owe more than you're owed" : "Even"}
          icon={Scale}
          tone={net >= 0 ? "primary" : "danger"}
        />
        <StatCard
          label="Overdue"
          value={formatINRCompact(overdueIn + overdueOut)}
          hint={`${formatINRCompact(overdueIn)} from customers · ${formatINRCompact(overdueOut)} to suppliers`}
          icon={AlertTriangle}
          tone={overdueRows.length ? "danger" : "success"}
          href={overdueRows.length ? "/accounts?show=overdue" : undefined}
        />
      </div>

      <AccountsTable rows={rows} today={t} exportHref="/api/export/accounts" />
    </div>
  );
}
