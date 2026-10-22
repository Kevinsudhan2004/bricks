import type { LiveState } from "@/domain/track";
import { formatTime } from "@/lib/format";
import { formatAgo, formatDuration, formatKmh } from "@/lib/tracking";
import type { FleetTruck } from "@/server/queries/trucks";

/** Colours and wording for a truck's live state, shared by the map page and the dashboard. */
export const STATE_META: Record<LiveState, { label: string; dot: string; text: string }> = {
  moving: { label: "Moving", dot: "bg-success", text: "text-success" },
  stopped: { label: "Stopped", dot: "bg-warning", text: "text-warning-foreground dark:text-warning" },
  no_signal: { label: "No signal", dot: "bg-destructive", text: "text-destructive" },
  off: { label: "Off duty", dot: "bg-muted-foreground/60", text: "text-muted-foreground" },
  never: { label: "Not started", dot: "bg-muted-foreground/30", text: "text-muted-foreground" },
};

export function statusLine(t: FleetTruck, now: number): { big: string; small: string } {
  switch (t.state) {
    case "moving":
      return { big: formatKmh(t.speedKmh), small: `Moving · updated ${formatAgo(t.lastPointAt!, now)}` };
    case "stopped": {
      const since = Math.max(t.lastMovingAt ?? 0, t.tripStartedAt ?? 0) || t.lastPointAt!;
      return { big: `Stopped ${formatDuration((now - since) / 1000)}`, small: `Since ${formatTime(new Date(since))} · updated ${formatAgo(t.lastPointAt!, now)}` };
    }
    case "no_signal":
      return {
        big: `No signal ${formatDuration((now - t.lastPointAt!) / 1000)}`,
        small: `Last seen ${formatTime(new Date(t.lastPointAt!))} — phone off, no network or app closed`,
      };
    case "off":
      return { big: "Off duty", small: `Last trip ended · last location ${formatAgo(t.lastPointAt!, now)}` };
    default:
      return t.phone
        ? { big: "Waiting for first trip", small: "Phone linked. Location shows once the driver taps Start." }
        : { big: "Phone not linked", small: "Link the driver's phone to start tracking." };
  }
}
