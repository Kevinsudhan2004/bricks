"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateShort, formatNumber } from "@/lib/format";

export type OrderOption = {
  id: number;
  orderNo: string;
  orderDate: string;
  customerName: string;
  customerPhone: string | null;
  pending: number;
  products: { productId: number; productName: string; pending: number }[];
};

/** Short form shown on buttons and chips: ORD/26-27/0085 → 0085 */
export function shortOrderNo(no: string) {
  return no.split("/").at(-1) ?? no;
}

/** Searchable list of open orders: type the order number, customer name or phone. */
export function OrderPicker({
  orders,
  value,
  onChange,
  id,
  invalid,
}: {
  orders: OrderOption[];
  value: number | undefined;
  onChange: (order: OrderOption) => void;
  id?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = orders.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className="h-auto min-h-11 w-full justify-between px-3 py-1.5 font-normal md:min-h-10"
        >
          {selected ? (
            <span className="min-w-0 text-left">
              <span className="block truncate">
                <span className="font-mono text-sm font-semibold">{selected.orderNo}</span>
                <span className="text-muted-foreground"> · {selected.customerName}</span>
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Choose order number</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0" align="start">
        <Command filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}>
          <CommandInput placeholder="Order no, customer or phone…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No open order matches.</CommandEmpty>
            <CommandGroup heading="Orders waiting for delivery (oldest first)">
              {orders.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.orderNo} ${shortOrderNo(o.orderNo)} ${o.customerName} ${o.customerPhone ?? ""} #${o.id}`}
                  onSelect={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                  className="items-start py-2.5"
                >
                  <Check className={cn("mt-0.5 size-4", value === o.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">{o.orderNo}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDateShort(o.orderDate)}</span>
                    </span>
                    <span className="block truncate text-sm">{o.customerName}</span>
                    <span className="block truncate text-xs text-info">
                      {o.products
                        .filter((p) => p.pending > 0)
                        .map((p) => `${formatNumber(p.pending)} ${p.productName}`)
                        .join(" · ")}{" "}
                      pending
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
