import { addDays, isValidIsoDate, startOfMonth } from "@/domain/dates";

export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "month" | "lastmonth" | "90d" | "custom";

export const RANGE_PRESETS: { value: Exclude<RangePreset, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
  { value: "lastmonth", label: "Last month" },
  { value: "90d", label: "90 days" },
];

export type DateRange = { from: string; to: string; preset: RangePreset; label: string };

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Turn ?range=7d or ?from=…&to=… into concrete dates (YYYY-MM-DD, inclusive). */
export function resolveRange(sp: SP, today: string, fallback: Exclude<RangePreset, "custom"> = "7d"): DateRange {
  const from = first(sp.from);
  const to = first(sp.to);
  if (from && to && isValidIsoDate(from) && isValidIsoDate(to)) {
    const [a, b] = from <= to ? [from, to] : [to, from];
    return { from: a, to: b, preset: "custom", label: "Custom" };
  }
  const preset = (first(sp.range) as RangePreset) || fallback;
  return presetRange(RANGE_PRESETS.some((p) => p.value === preset) ? preset : fallback, today);
}

export function presetRange(preset: RangePreset, today: string): DateRange {
  const label = RANGE_PRESETS.find((p) => p.value === preset)?.label ?? "Custom";
  switch (preset) {
    case "today":
      return { from: today, to: today, preset, label };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y, preset, label };
    }
    case "30d":
      return { from: addDays(today, -29), to: today, preset, label };
    case "90d":
      return { from: addDays(today, -89), to: today, preset, label };
    case "month":
      return { from: startOfMonth(today), to: today, preset, label };
    case "lastmonth": {
      const end = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(end), to: end, preset, label };
    }
    case "7d":
    default:
      return { from: addDays(today, -6), to: today, preset: "7d", label: "7 days" };
  }
}
