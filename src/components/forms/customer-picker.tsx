"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type CustomerOption = {
  id: number;
  name: string;
  firmName: string | null;
  phone: string | null;
  stateName?: string | null;
  siteAddress?: string | null;
};

/** Searchable customer dropdown (name, firm or phone). */
export function CustomerPicker({
  customers,
  value,
  onChange,
  id,
  invalid,
  badges,
  newHref,
  onNew,
  placeholder = "Choose customer",
}: {
  customers: CustomerOption[];
  value: number | undefined;
  onChange: (customer: CustomerOption) => void;
  id?: string;
  invalid?: boolean;
  /** Optional right-hand note per customer, e.g. "8,000 pending" */
  badges?: Map<number, string>;
  newHref?: string;
  /** Add a customer without leaving the page (takes precedence over `newHref`). */
  onNew?: () => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value);

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
          className="h-11 w-full justify-between px-3 font-normal md:h-9"
        >
          {selected ? (
            <span className="truncate">
              {selected.firmName ?? selected.name}
              {selected.firmName && <span className="text-muted-foreground"> · {selected.name}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search name, firm or phone…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No customer found.</CommandEmpty>
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.firmName ?? ""} ${c.phone ?? ""} #${c.id}`}
                  onSelect={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                  className="py-2.5"
                >
                  <Check className={cn("size-4", value === c.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{c.firmName ?? c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.firmName ? c.name : ""}
                      {c.phone ? `${c.firmName ? " · " : ""}${c.phone}` : ""}
                    </span>
                  </span>
                  {badges?.get(c.id) && (
                    <span className="ml-2 shrink-0 text-xs font-medium text-info">{badges.get(c.id)}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {onNew ? (
            <div className="border-t p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNew();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-primary hover:bg-accent"
              >
                <Plus className="size-4" aria-hidden /> Add new customer
              </button>
            </div>
          ) : newHref && (
            <div className="border-t p-1">
              <Link
                href={newHref}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-primary hover:bg-accent"
              >
                <Plus className="size-4" aria-hidden /> Add new customer
              </Link>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
