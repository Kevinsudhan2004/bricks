"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/** Label + control + inline error/hint. Errors sit right under the field they belong to. */
export function FormField({
  label,
  error,
  hint,
  required,
  className,
  htmlFor,
  children,
}: {
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)} data-invalid={!!error || undefined}>
      <Label htmlFor={htmlFor} className="text-[13px]">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function useFieldId(name: string) {
  return `${useId()}-${name}`;
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 shadow-xs md:p-5", className)}>
      {title && (
        <header className="mb-4">
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </header>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Set when a form is shown in the quick-entry sheet instead of on its own page. */
export type SheetMode<T = number> = { onDone: (saved: T) => void; onCancel: () => void };

/** Save buttons: stick above the phone tab bar so they're always reachable; inline on larger screens. In a sheet they pin to its bottom edge. */
export function FormFooter({ children, className, sheet }: { children: React.ReactNode; className?: string; sheet?: boolean }) {
  return (
    <div
      className={cn(
        sheet
          ? "sticky bottom-0 z-20 -mx-4 flex flex-row justify-end gap-2 border-t bg-popover/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:-mx-6 md:px-6 *:flex-1 sm:*:flex-none"
          : "sticky bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-20 -mx-4 flex flex-col-reverse gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Large tappable option cards (used instead of dropdowns for 2–4 choices). */
export function ChoiceCards<T extends string | number>({
  value,
  onChange,
  options,
  name,
  columns = 3,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: string; sub?: string; color?: string }[];
  name: string;
  columns?: 2 | 3 | 4;
}) {
  const cols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <div role="radiogroup" aria-label={name} className={cn("grid gap-2", cols)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-all",
              selected
                ? "border-primary bg-accent ring-2 ring-primary/25"
                : "bg-card hover:border-foreground/20 active:bg-muted",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {o.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} aria-hidden />}
              {o.label}
            </span>
            {o.sub && <span className="mt-0.5 text-xs text-muted-foreground">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
