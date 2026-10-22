"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BatteryCharging,
  BatteryLow,
  BatteryMedium,
  ChevronRight,
  EyeOff,
  History,
  Link2,
  Link2Off,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  Smartphone,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import type { LiveState } from "@/domain/track";
import { formatAgo, formatDuration, formatKm, formatKmh, LIVE_REFRESH_MS } from "@/lib/tracking";
import type { Fleet, FleetTruck } from "@/server/queries/trucks";
import { STATE_META, statusLine } from "@/components/trucks/status";
import type { MapTruck } from "@/components/trucks/fleet-map";
import { LinkPhoneDialog, TruckFormDialog, truckInput, UnlinkPhoneDialog } from "./truck-forms";

const FleetMap = dynamic(() => import("@/components/trucks/fleet-map"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-xl" />,
});

const STATE_ORDER: LiveState[] = ["moving", "stopped", "no_signal", "off", "never"];

/** One-second clock aligned to the server's time (so "12 s ago" stays right on a phone with a wrong clock). */
function useNow(serverNow: number, receivedAt: number) {
  const subscribe = useCallback((cb: () => void) => {
    const id = setInterval(cb, 1000);
    return () => clearInterval(id);
  }, []);
  const tick = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000),
    () => Math.floor(receivedAt / 1000),
  );
  return serverNow + (tick * 1000 - receivedAt);
}

function Battery({ level, charging }: { level: number | null; charging: boolean | null }) {
  if (level === null) return null;
  const Icon = charging ? BatteryCharging : level <= 20 ? BatteryLow : BatteryMedium;
  return (
    <span className={cn("inline-flex items-center gap-1", level <= 20 && !charging && "font-medium text-destructive")}>
      <Icon className="size-3.5" aria-hidden />
      <span className="num">{level}%</span>
      <span className="sr-only">{charging ? "charging" : "battery"}</span>
    </span>
  );
}

type DialogState = { kind: "add" | "edit" | "link" | "unlink"; truckId: number | null } | null;

export function FleetLive({ initial }: { initial: Fleet }) {
  const [fleet, setFleet] = useState(initial);
  const [receivedAt, setReceivedAt] = useState(initial.now);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [showHidden, setShowHidden] = useState(false);
  const now = useNow(fleet.now, receivedAt);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/trucks/live", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login?next=/trucks");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Fleet;
      setFleet(data);
      setReceivedAt(Date.now());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [router]);

  // Poll while the page is visible; catch up immediately when it comes back.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const startPolling = () => {
      clearInterval(id);
      id = setInterval(refresh, LIVE_REFRESH_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        startPolling();
      } else clearInterval(id);
    };
    startPolling();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // Trucks on the road first, then by name.
  const active = fleet.trucks
    .filter((t) => t.active)
    .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.name.localeCompare(b.name));
  const hidden = fleet.trucks.filter((t) => !t.active);
  const onMap: MapTruck[] = useMemo(
    () =>
      fleet.trucks
        .filter((t) => t.active && t.lat !== null && t.lng !== null)
        .map((t) => ({
          id: t.id,
          lat: t.lat!,
          lng: t.lng!,
          state: t.state,
          heading: t.heading,
          accuracyM: t.accuracyM,
          label: `${t.plateNo ?? t.name}${t.state === "moving" && t.speedKmh !== null ? ` · ${Math.round(t.speedKmh)} km/h` : ""}`,
        })),
    [fleet.trucks],
  );
  const counts = active.reduce<Record<LiveState, number>>(
    (a, t) => ({ ...a, [t.state]: a[t.state] + 1 }),
    { moving: 0, stopped: 0, no_signal: 0, off: 0, never: 0 },
  );
  const todayKm = active.reduce((a, t) => a + t.today.distanceM, 0);
  const dialogTruck = dialog?.truckId ? (fleet.trucks.find((t) => t.id === dialog.truckId) ?? null) : null;
  const open = (kind: NonNullable<DialogState>["kind"], truckId: number | null = null) => setDialog({ kind, truckId });
  const close = () => setDialog(null);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-2">
        {(["moving", "stopped", "no_signal", "off"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm">
            <span aria-hidden className={cn("size-2 rounded-full", STATE_META[s].dot)} />
            <span className="num font-semibold">{counts[s]}</span>
            <span className="text-muted-foreground">{STATE_META[s].label}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm">
          <span className="num font-semibold">{formatKm(todayKm)}</span>
          <span className="text-muted-foreground">today</span>
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          <span className={cn("relative flex size-2", failed ? "text-destructive" : "text-success")} aria-hidden>
            {!failed && <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />}
            <span className="relative inline-flex size-2 rounded-full bg-current" />
          </span>
          {failed ? "Can't reach the server — retrying" : `Live · refreshed ${formatAgo(fleet.now, now)}`}
        </span>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No trucks yet"
          description="Add your first truck, then link the driver's phone with the Truck Tracker app."
          action={
            <Button onClick={() => open("add")}>
              <Plus aria-hidden /> Add truck
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <div className="h-[52dvh] min-h-80 overflow-hidden rounded-xl border bg-card shadow-xs lg:sticky lg:top-20 lg:h-[calc(100dvh-12rem)]">
            {onMap.length ? (
              <FleetMap trucks={onMap} selectedId={selected} onSelect={setSelected} className="size-full rounded-xl" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <Smartphone className="size-8" aria-hidden />
                No locations yet. Trucks appear here once a driver taps Start in the app.
              </div>
            )}
          </div>

          <ul className="space-y-2" aria-label="Trucks">
            {active.map((t) => (
              <TruckCard
                key={t.id}
                truck={t}
                now={now}
                selected={selected === t.id}
                onSelect={() => setSelected(t.id)}
                onAction={(kind) => open(kind, t.id)}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => open("add")}>
          <Plus aria-hidden /> Add truck
        </Button>
        {hidden.length > 0 && (
          <Button variant="ghost" onClick={() => setShowHidden((v) => !v)}>
            <EyeOff aria-hidden /> {showHidden ? "Hide" : "Show"} {hidden.length} hidden truck{hidden.length === 1 ? "" : "s"}
          </Button>
        )}
      </div>
      {showHidden && hidden.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {hidden.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-dashed bg-card p-3 text-sm">
              <span className="min-w-0 truncate">
                {t.name} {t.plateNo && <span className="font-mono text-xs text-muted-foreground">{t.plateNo}</span>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => open("edit", t.id)}>
                <Pencil aria-hidden /> Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      <TruckFormDialog
        id={dialog?.kind === "edit" ? (dialog.truckId ?? null) : null}
        initial={dialog?.kind === "edit" && dialogTruck ? truckInput(dialogTruck) : undefined}
        open={dialog?.kind === "add" || dialog?.kind === "edit"}
        onOpenChange={(o) => !o && close()}
        onSaved={(id, isNew) => {
          refresh();
          // A new truck's next step is linking the phone.
          setDialog(isNew ? { kind: "link", truckId: id } : null);
        }}
      />
      <LinkPhoneDialog truck={dialogTruck} open={dialog?.kind === "link"} onOpenChange={(o) => !o && close()} onChanged={refresh} />
      <UnlinkPhoneDialog truck={dialogTruck} open={dialog?.kind === "unlink"} onOpenChange={(o) => !o && close()} onChanged={refresh} />
    </div>
  );
}

function TruckCard({
  truck: t,
  now,
  selected,
  onSelect,
  onAction,
}: {
  truck: FleetTruck;
  now: number;
  selected: boolean;
  onSelect: () => void;
  onAction: (kind: "edit" | "link" | "unlink") => void;
}) {
  const meta = STATE_META[t.state];
  const line = statusLine(t, now);
  const hasPosition = t.lat !== null;

  return (
    <li
      className={cn(
        "rounded-xl border bg-card shadow-xs transition-colors",
        selected ? "border-primary/60 ring-2 ring-primary/20" : "hover:border-primary/30",
      )}
    >
      <div className="flex items-start gap-3 p-3 pb-2">
        <button
          type="button"
          onClick={onSelect}
          disabled={!hasPosition}
          className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-default"
          aria-label={hasPosition ? `Show ${t.name} on the map` : undefined}
        >
          <span className="relative mt-1 flex size-3 shrink-0" aria-hidden>
            {t.state === "moving" && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", meta.dot)} />}
            <span className={cn("relative inline-flex size-3 rounded-full", meta.dot)} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="truncate font-semibold">{t.name}</span>
              {t.plateNo && <span className="font-mono text-xs text-muted-foreground">{t.plateNo}</span>}
            </span>
            <span className={cn("num mt-0.5 block text-lg leading-tight font-semibold", meta.text)}>{line.big}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{line.small}</span>
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More for ${t.name}`}>
              <MoreVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onAction("edit")}>
              <Pencil aria-hidden /> Edit truck & driver
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("link")}>
              <Link2 aria-hidden /> {t.phone ? "Link a different phone" : "Link driver's phone"}
            </DropdownMenuItem>
            {t.phone && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onAction("unlink")}>
                  <Link2Off aria-hidden /> Unlink phone
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
        {t.today.trips > 0 ? (
          <>
            <span>
              Today <span className="num font-medium text-foreground">{formatKm(t.today.distanceM)}</span>
            </span>
            <span>
              Driving <span className="num font-medium text-foreground">{formatDuration(t.today.movingSeconds)}</span>
            </span>
            <span>
              Top <span className="num font-medium text-foreground">{formatKmh(t.today.maxSpeedKmh)}</span>
            </span>
          </>
        ) : (
          <span>No trips today</span>
        )}
        <Battery level={t.battery} charging={t.charging} />
      </div>

      <div className="flex items-center gap-1 border-t px-1.5 py-1">
        {t.driverPhone ? (
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <a href={`tel:${t.driverPhone}`}>
              <Phone aria-hidden /> {t.driverName ?? "Call driver"}
            </a>
          </Button>
        ) : t.driverName ? (
          <span className="px-2 text-xs text-muted-foreground">{t.driverName}</span>
        ) : null}
        {!t.phone && (
          <Button variant="ghost" size="sm" className="text-primary" onClick={() => onAction("link")}>
            <Link2 aria-hidden /> Link phone
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link href={`/trucks/${t.id}`}>
            <History aria-hidden /> History <ChevronRight className="-ml-1" aria-hidden />
          </Link>
        </Button>
      </div>
    </li>
  );
}
