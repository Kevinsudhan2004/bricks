"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type TableSpec = {
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, React.ReactNode>[];
};

/**
 * Card wrapper for every chart: title, one-line takeaway, legend, and a
 * Chart ⇄ Table toggle so the numbers are always readable without colour.
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  legend?: { label: string; color: string; shape?: "dot" | "line" }[];
  table?: TableSpec;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-xs md:p-5", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {table && (
            <div className="flex rounded-lg border p-0.5" role="group" aria-label="View as">
              {(
                [
                  ["chart", BarChart3, "Chart"],
                  ["table", Table2, "Table"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  aria-label={`Show ${label.toLowerCase()}`}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md transition-colors md:size-7",
                    view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      {legend && legend.length > 1 && view === "chart" && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={l.shape === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]"}
                style={{ background: l.color }}
              />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 min-h-0 flex-1">
        {view === "chart" || !table ? (
          children
        ) : (
          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c.key} className={cn("px-3 py-2 font-medium", c.align === "right" ? "text-right" : "text-left")}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {table.columns.map((c) => (
                      <td key={c.key} className={cn("num px-3 py-1.5", c.align === "right" ? "text-right" : "text-left")}>
                        {r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
