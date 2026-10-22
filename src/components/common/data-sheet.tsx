"use client";

import { Fragment, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type SheetColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Makes the column sortable by clicking its header. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Footer total, computed over the rows currently shown. */
  total?: (rows: T[]) => React.ReactNode;
  /** Width / min-width utilities for the column (applied to header and cells). */
  className?: string;
};

type Sort = { id: string; dir: "asc" | "desc" };

const INTERACTIVE = "a,button,input,select,textarea,label,[role=menuitem],[role=dialog]";

/**
 * Spreadsheet-style record list: one line per record with every key value in its own column, a frozen
 * first column and header, sortable columns, search, a totals row, and a ▸ on each row that unfolds
 * the rest of the record in place. Scrolls sideways on phones instead of stacking into cards.
 */
export function DataSheet<T>({
  rows,
  columns,
  rowKey,
  expand,
  searchText,
  searchPlaceholder = "Search",
  toolbar,
  empty,
  initialSort,
  rowClassName,
  noun = ["row", "rows"],
}: {
  rows: T[];
  columns: SheetColumn<T>[];
  rowKey: (row: T) => string | number;
  /** Extra details shown when a row is expanded. */
  expand?: (row: T) => React.ReactNode;
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Buttons shown next to the search box (e.g. "New order", CSV). */
  toolbar?: React.ReactNode;
  /** Shown instead of the table when there are no rows at all. */
  empty?: React.ReactNode;
  initialSort?: Sort;
  rowClassName?: (row: T) => string | undefined;
  noun?: [string, string];
}) {
  const baseId = useId();
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());
  const [sort, setSort] = useState<Sort | undefined>(initialSort);
  const [openRows, setOpenRows] = useState<Set<string | number>>(() => new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows.length]);

  const shown = useMemo(() => {
    const filtered = q && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : rows;
    const col = sort && columns.find((c) => c.id === sort.id);
    if (!sort || !col?.sortValue) return filtered;
    const get = col.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en-IN", { numeric: true })) * dir;
    });
  }, [rows, q, searchText, sort, columns]);

  if (rows.length === 0 && empty) {
    return (
      <div className="space-y-2">
        {toolbar && <div className="flex flex-wrap items-center justify-end gap-2">{toolbar}</div>}
        {empty}
      </div>
    );
  }

  const hasTotals = columns.some((c) => c.total);
  const span = columns.length + (expand ? 1 : 0);
  const toggle = (key: string | number) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const onSort = (id: string) =>
    setSort((s) => (s?.id === id ? { id, dir: s.dir === "asc" ? "desc" : "asc" } : { id, dir: "asc" }));
  const align = (c: SheetColumn<T>) => (c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left");
  // Frozen columns: the ▸ gutter (2.75rem) and the first data column.
  const frozen = (i: number) =>
    i === 0 &&
    cn(
      "sticky z-10 transition-shadow group-data-[scrolled=true]/sheet:shadow-[6px_0_8px_-6px_rgb(0_0_0/0.18)]",
      expand ? "left-11" : "left-0",
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {searchText && (
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
              aria-label={searchPlaceholder}
            />
          </div>
        )}
        {toolbar && <div className="ml-auto flex flex-wrap items-center gap-2">{toolbar}</div>}
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 4)}
        data-scrolled={scrolled}
        className="group/sheet relative max-h-[72dvh] overflow-auto overscroll-x-contain rounded-xl border bg-card shadow-xs md:max-h-[calc(100dvh-10rem)]"
      >
        <table className="w-full border-separate border-spacing-0 text-[13px] md:text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              {expand && (
                <th scope="col" className="sticky left-0 z-10 w-11 min-w-11 border-r border-b bg-muted">
                  <span className="sr-only">Details</span>
                </th>
              )}
              {columns.map((c, i) => {
                const active = sort?.id === c.id;
                const label = (
                  <>
                    {c.header}
                    {c.sortValue &&
                      (active ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="size-3 shrink-0" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3 shrink-0" aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 shrink-0 opacity-40" aria-hidden />
                      ))}
                  </>
                );
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "h-10 border-r border-b bg-muted px-3 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase last:border-r-0",
                      align(c),
                      frozen(i),
                      c.className,
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.id)}
                        className={cn(
                          "inline-flex items-center gap-1 uppercase hover:text-foreground",
                          c.align === "right" && "flex-row-reverse",
                          active && "text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={span} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nothing matches “{query.trim()}”.
                </td>
              </tr>
            )}
            {shown.map((row, idx) => {
              const key = rowKey(row);
              const isOpen = openRows.has(key);
              const detailId = `${baseId}-${key}`;
              return (
                <Fragment key={key}>
                  <tr
                    onClick={
                      expand
                        ? (e) => {
                            if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
                            toggle(key);
                          }
                        : undefined
                    }
                    className={cn(
                      "group/row [--row-bg:var(--card)]",
                      idx % 2 === 1 && "[--row-bg:color-mix(in_srgb,var(--card),var(--muted)_55%)]",
                      expand && "cursor-pointer",
                      isOpen ? "[--row-bg:var(--accent)]" : "hover:[--row-bg:color-mix(in_srgb,var(--card),var(--accent)_70%)]",
                      rowClassName?.(row),
                    )}
                  >
                    {expand && (
                      <td className="sticky left-0 z-10 border-r border-b bg-(--row-bg) p-0 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(key)}
                          aria-expanded={isOpen}
                          aria-controls={isOpen ? detailId : undefined}
                          aria-label={isOpen ? "Hide details" : "Show details"}
                          className="inline-flex size-11 items-center justify-center text-muted-foreground hover:text-foreground"
                        >
                          <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90 text-primary")} aria-hidden />
                        </button>
                      </td>
                    )}
                    {columns.map((c, i) => (
                      <td
                        key={c.id}
                        className={cn(
                          "h-11 border-r border-b bg-(--row-bg) px-3 py-1.5 whitespace-nowrap last:border-r-0 pointer-coarse:h-12",
                          align(c),
                          c.align === "right" && "num",
                          frozen(i),
                          c.className,
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                  {expand && isOpen && (
                    <tr id={detailId}>
                      <td colSpan={span} className="border-b bg-accent/40 p-0">
                        <div className="sticky left-0 px-4 py-4 md:px-5" style={{ width }}>
                          {expand(row)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {hasTotals && shown.length > 0 && (
            <tfoot className="sticky bottom-0 z-20">
              <tr>
                {expand && <td className="sticky left-0 z-10 border-t border-r bg-muted" />}
                {columns.map((c, i) => (
                  <td
                    key={c.id}
                    className={cn(
                      "h-10 border-t border-r bg-muted px-3 font-semibold whitespace-nowrap last:border-r-0",
                      align(c),
                      c.align === "right" && "num",
                      frozen(i),
                      c.className,
                    )}
                  >
                    {c.total ? c.total(shown) : i === 0 ? "Total" : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        {shown.length === rows.length ? `${rows.length} ${rows.length === 1 ? noun[0] : noun[1]}` : `${shown.length} of ${rows.length} ${noun[1]}`}
        {expand && <span className="hidden sm:inline"> · tap a row for details</span>}
      </p>
    </div>
  );
}

/** Label/value grid for an expanded row, with optional action buttons underneath. */
export function SheetDetails({
  items,
  actions,
  children,
}: {
  items: [label: string, value: React.ReactNode][];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const visible = items.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false);
  return (
    <div className="space-y-4">
      {visible.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
              <dd className="mt-0.5 text-sm break-words whitespace-pre-line">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
