import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "info";

const toneIcon: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-accent text-accent-foreground",
  success: "bg-success/12 text-success",
  warning: "bg-warning/18 text-warning-foreground dark:text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info/12 text-info",
};

/** KPI tile: big number, label, optional hint/progress. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  progress,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** 0–100; renders a thin bar under the value */
  progress?: number;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", toneIcon[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <p className="num mt-1 text-2xl font-semibold tracking-tight md:text-[1.65rem]">{value}</p>
      {progress !== undefined && (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} progress`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              progress >= 100 ? "bg-success" : progress >= 60 ? "bg-primary" : "bg-warning",
            )}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const classes = cn(
    "rounded-xl border bg-card p-4 text-card-foreground shadow-xs transition-colors",
    href && "hover:border-primary/40 hover:bg-accent/30",
    className,
  );
  return href ? (
    <Link href={href} className={cn(classes, "block")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
