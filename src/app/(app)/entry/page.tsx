import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardList, Factory, Truck, Warehouse } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/common/skeletons";
import { getCurrentUser } from "@/lib/auth";
import { materialColor, productColor } from "@/lib/colors";
import { formatDate, formatNumber, formatTime, formatTonnes, pct } from "@/lib/format";
import { today } from "@/lib/today";
import { cn } from "@/lib/utils";
import { getDispatchList } from "@/server/queries/dispatch";
import { getInboundList } from "@/server/queries/inbound";
import { getActiveMasters } from "@/server/queries/masters";
import { getProductionList } from "@/server/queries/production";

export const metadata: Metadata = { title: "Today" };

const ACTIONS = [
  { href: "/inbound", title: "Inbound", sub: "Material received", icon: Warehouse, tone: "bg-[color-mix(in_oklch,var(--mat-flyash)_14%,transparent)] text-[var(--mat-flyash)]" },
  { href: "/production", title: "Production", sub: "Bricks made", icon: Factory, tone: "bg-accent text-accent-foreground" },
  { href: "/dispatch", title: "Dispatch", sub: "Truck going out", icon: Truck, tone: "bg-info/12 text-info" },
  { href: "/orders", title: "Orders", sub: "Customer orders", icon: ClipboardList, tone: "bg-success/12 text-success" },
];

export default function EntryHome() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Suspense fallback={<Skeleton className="h-14 w-64" />}>
        <Greeting />
      </Suspense>

      {/* Big, thumb-friendly entry buttons. Links prefetch the forms (and their dropdown data) as soon as they're visible. */}
      <nav aria-label="Add entry" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            prefetch
            className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-xs transition-all hover:border-primary/40 active:scale-[0.99] sm:flex-col sm:items-start sm:p-5"
          >
            <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl", a.tone)}>
              <a.icon className="size-7" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold">{a.title}</span>
              <span className="block text-sm text-muted-foreground">{a.sub}</span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground sm:hidden" aria-hidden />
          </Link>
        ))}
      </nav>

      <Suspense fallback={<ListSkeleton rows={4} />}>
        <TodaySummary />
      </Suspense>
    </div>
  );
}

async function Greeting() {
  const [user, t] = await Promise.all([getCurrentUser(), today()]);
  return (
    <header>
      <p className="text-sm text-muted-foreground">{formatDate(t)}</p>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Hello, {user.name.split(" ")[0]}</h1>
      <p className="mt-1 text-sm text-muted-foreground">What would you like to record?</p>
    </header>
  );
}

async function TodaySummary() {
  const [user, t, masters] = await Promise.all([getCurrentUser(), today(), getActiveMasters()]);
  const [inbound, production, dispatch] = await Promise.all([
    getInboundList(t, t, null),
    getProductionList(t, t, null),
    getDispatchList(t, t, null),
  ]);
  const mine = <T extends { createdBy: number }>(rows: T[]) => rows.filter((r) => r.createdBy === user.id);

  type Item = { key: string; time: Date; href: string; icon: typeof Warehouse; title: string; sub: string; color: string };
  const items: Item[] = [
    ...mine(inbound.rows).map((r) => ({
      key: `i${r.id}`,
      time: r.createdAt,
      href: "/inbound",
      icon: Warehouse,
      title: `${formatTonnes(r.netKg)} ${r.materialName}`,
      sub: r.supplierName ?? "Inbound",
      color: materialColor(r.materialCode),
    })),
    ...mine(production.rows).map((r) => ({
      key: `p${r.id}`,
      time: r.createdAt,
      href: "/production",
      icon: Factory,
      title: `${formatNumber(r.quantityProduced)} ${r.productName}`,
      sub: r.quantityRejected ? `${formatNumber(r.quantityRejected)} broken` : "Production",
      color: productColor(r.productCode),
    })),
    ...mine(dispatch).map((r) => ({
      key: `d${r.id}`,
      time: r.createdAt,
      href: `/dispatch/${r.id}`,
      icon: Truck,
      title: r.items.map((i) => `${formatNumber(i.quantity)} ${i.name}`).join(" + "),
      sub: `${r.firmName ?? r.customerName}${r.vehicleNo ? ` · ${r.vehicleNo}` : ""}`,
      color: "var(--info)",
    })),
  ].sort((a, b) => +new Date(b.time) - +new Date(a.time));

  return (
    <>
      <section aria-labelledby="factory-today" className="rounded-2xl border bg-card p-4 md:p-5">
        <h2 id="factory-today" className="font-semibold">
          Factory today
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {masters.products.map((p, i) => {
            const made = production.totals.find((x) => x.productId === p.id)?.produced ?? 0;
            const sent = dispatch.reduce((a, d) => a + d.items.filter((it) => it.productId === p.id).reduce((s, it) => s + it.quantity, 0), 0);
            const usage = pct(made, p.dailyCapacity);
            return (
              <div key={p.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="size-2 rounded-full" style={{ background: productColor(p.code, i) }} aria-hidden />
                    {p.name}
                  </span>
                  <span className="num text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatNumber(made)}</span> / {formatNumber(p.dailyCapacity)}
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(usage, 100)}%`, background: productColor(p.code, i) }} />
                </div>
                <p className="num mt-1 text-xs text-muted-foreground">
                  {usage}% of capacity · {formatNumber(sent)} dispatched
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">
          {masters.materials.map((m, i) => {
            const kg = inbound.totals.find((x) => x.materialId === m.id)?.netKg ?? 0;
            return (
              <div key={m.id}>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: materialColor(m.code, i) }} aria-hidden />
                  {m.name}
                </p>
                <p className="num font-semibold">{formatTonnes(kg)}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="my-entries">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="my-entries" className="font-semibold">
            My entries today
          </h2>
          <span className="text-sm text-muted-foreground">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing yet. Tap a button above to add your first entry.
          </p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {items.map((it) => (
              <li key={it.key}>
                <Link href={it.href} className="flex items-center gap-3 p-3.5 active:bg-muted">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <it.icon className="size-5" style={{ color: it.color }} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{it.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{it.sub}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatTime(it.time)}</span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-center text-xs text-muted-foreground">To fix a mistake, tap the pencil next to the entry in Inbound, Production or Dispatch. Your own entries can be changed until midnight.</p>
      </section>
    </>
  );
}
