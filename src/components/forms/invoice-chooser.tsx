"use client";

import { cn } from "@/lib/utils";
import { formatDate, formatINR } from "@/lib/format";
import type { InvoiceBalanceOption } from "@/server/queries/money";

/** Pick one of the customer's invoices (with balance) or "no specific invoice". */
export function InvoiceChooser({
  invoices,
  value,
  onChange,
  noneLabel,
  noneHint,
  onlyDue = true,
}: {
  invoices: InvoiceBalanceOption[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  noneLabel: string;
  noneHint: string;
  onlyDue?: boolean;
}) {
  const list = onlyDue ? invoices.filter((i) => i.balance > 0 || i.id === value) : invoices;
  return (
    <div role="radiogroup" aria-label="Order" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {list.map((inv) => {
        const selected = inv.id === value;
        return (
          <button
            key={inv.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(inv.id)}
            className={cn(
              "rounded-xl border p-3 text-left transition-all",
              selected ? "border-primary bg-accent ring-2 ring-primary/25" : "bg-card hover:border-foreground/20",
            )}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs font-medium">{inv.invoiceNo}</span>
              <span className="text-xs text-muted-foreground">{formatDate(inv.invoiceDate)}</span>
            </span>
            <span className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Total {formatINR(inv.total, { decimals: false })}</span>
              <span className={cn("num text-sm font-semibold", inv.overdue && "text-destructive")}>
                {inv.balance > 0 ? `${formatINR(inv.balance)} due` : "Paid"}
              </span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        role="radio"
        aria-checked={value === undefined}
        onClick={() => onChange(undefined)}
        className={cn(
          "rounded-xl border border-dashed p-3 text-left transition-all",
          value === undefined ? "border-primary bg-accent ring-2 ring-primary/25" : "bg-card hover:border-foreground/20",
        )}
      >
        <span className="block text-sm font-medium">{noneLabel}</span>
        <span className="block text-xs text-muted-foreground">{noneHint}</span>
      </button>
    </div>
  );
}
