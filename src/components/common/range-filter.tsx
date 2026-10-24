"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RANGE_PRESETS, type RangePreset } from "@/lib/date-range";
import { formatDateShort } from "@/lib/format";

function buildHref(pathname: string, params: Record<string, string>, patch: Record<string, string | undefined>) {
  const next = new URLSearchParams(params);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) next.delete(k);
    else next.set(k, v);
  }
  next.delete("page");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Date range chips (Today / 7 days / This month …) plus a custom from–to picker. */
export function RangeFilter({
  pathname,
  params,
  preset,
  from,
  to,
  presets = ["today", "yesterday", "7d", "30d", "month", "lastmonth"],
}: {
  pathname: string;
  params: Record<string, string>;
  preset: RangePreset;
  from: string;
  to: string;
  presets?: Exclude<RangePreset, "custom">[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  return (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
      {RANGE_PRESETS.filter((p) => presets.includes(p.value)).map((p) => (
        <Link
          key={p.value}
          href={buildHref(pathname, params, { range: p.value, from: undefined, to: undefined })}
          scroll={false}
          className={cn(
            "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
            preset === p.value
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
          aria-current={preset === p.value ? "true" : undefined}
        >
          {p.label}
        </Link>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              preset === "custom"
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarRange className="size-4" aria-hidden />
            {preset === "custom" ? `${formatDateShort(from)} – ${formatDateShort(to)}` : "Custom"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setOpen(false);
              router.push(buildHref(pathname, params, { range: undefined, from: customFrom, to: customTo }), {
                scroll: false,
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="range-from">From</Label>
              <Input id="range-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="range-to">To</Label>
              <Input id="range-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
            <Button type="submit" className="w-full">
              Show
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Pill links to filter a list by one value (material, product, status…). */
export function ChipFilter({
  pathname,
  params,
  name,
  value,
  options,
  allLabel = "All",
  hideAll = false,
}: {
  pathname: string;
  params: Record<string, string>;
  name: string;
  value: string | undefined;
  options: { value: string; label: string; color?: string }[];
  allLabel?: string;
  /** Don't render the leading "All" chip (when the options include their own). */
  hideAll?: boolean;
}) {
  return (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
      {[...(hideAll ? [] : [{ value: "", label: allLabel }]), ...options].map((o) => {
        const active = (value ?? "") === o.value;
        return (
          <Link
            key={o.value || "__all"}
            href={buildHref(pathname, params, { [name]: o.value || undefined })}
            scroll={false}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
              active ? "border-foreground/30 bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {"color" in o && o.color && <span className="size-2 rounded-full" style={{ background: o.color }} aria-hidden />}
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
