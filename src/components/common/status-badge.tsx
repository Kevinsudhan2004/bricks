import { cn } from "@/lib/utils";
import type { DeliveryStatus, PaymentStatus } from "@/domain/invoice";
import type { DocState } from "@/domain/settlement";

const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const deliveryStyles: Record<DeliveryStatus, { label: string; className: string }> = {
  not_started: { label: "Not delivered", className: "bg-muted text-muted-foreground" },
  partial: { label: "Partly delivered", className: "bg-info/12 text-info" },
  completed: { label: "Delivered", className: "bg-success/12 text-success" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground line-through" },
};

const paymentStyles: Record<PaymentStatus, { label: string; className: string }> = {
  unpaid: { label: "Unpaid", className: "bg-warning/20 text-warning-foreground dark:text-warning" },
  partial: { label: "Part paid", className: "bg-info/12 text-info" },
  paid: { label: "Paid", className: "bg-success/12 text-success" },
  overdue: { label: "Overdue", className: "bg-destructive/12 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

/** Orders are "completed", supplier bills are "closed"; both mean debit and credit matched. */
const stateLabels = {
  order: { ongoing: "Ongoing", ready: "Ready to complete", closed: "Completed", cancelled: "Cancelled" },
  bill: { ongoing: "Ongoing", ready: "Ready to close", closed: "Closed", cancelled: "Cancelled" },
} as const;

const stateStyles = {
  ongoing: "bg-primary/10 text-primary",
  ready: "bg-success/12 text-success ring-1 ring-success/30",
  closed: "bg-foreground/8 text-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
} as const;

export function StateBadge({
  state,
  ready = false,
  kind = "order",
  className,
}: {
  state: DocState;
  /** Ongoing but debit = credit (and, for orders, fully delivered). */
  ready?: boolean;
  kind?: "order" | "bill";
  className?: string;
}) {
  const key = state === "ongoing" && ready ? "ready" : state;
  return (
    <span className={cn(base, stateStyles[key], className)}>
      <Dot />
      {stateLabels[kind][key]}
    </span>
  );
}

function Dot() {
  return <span aria-hidden className="size-1.5 rounded-full bg-current" />;
}

export function DeliveryBadge({ status, className }: { status: DeliveryStatus; className?: string }) {
  const s = deliveryStyles[status];
  return (
    <span className={cn(base, s.className, className)}>
      <Dot />
      {s.label}
    </span>
  );
}

export function PaymentBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const s = paymentStyles[status];
  return (
    <span className={cn(base, s.className, className)}>
      <Dot />
      {s.label}
    </span>
  );
}

export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-accent text-accent-foreground",
    success: "bg-success/12 text-success",
    warning: "bg-warning/20 text-warning-foreground dark:text-warning",
    danger: "bg-destructive/12 text-destructive",
    info: "bg-info/12 text-info",
  };
  return <span className={cn(base, tones[tone], className)}>{children}</span>;
}
