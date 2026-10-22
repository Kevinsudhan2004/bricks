"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SupplierChoice = { supplierId?: number; newName?: string };

/** Dropdown of suppliers with search. Typing a name that isn't in the list offers "Add …". */
export function SupplierPicker({
  suppliers,
  value,
  onChange,
  id,
}: {
  suppliers: { id: number; name: string }[];
  value: SupplierChoice;
  onChange: (v: SupplierChoice) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // A typed name that has since been saved counts as an existing supplier.
  const selected =
    suppliers.find((s) => s.id === value.supplierId) ??
    (value.newName ? suppliers.find((s) => s.name.toLowerCase() === value.newName!.toLowerCase()) : undefined);
  const typed = search.trim();
  const exact = suppliers.some((s) => s.name.toLowerCase() === typed.toLowerCase());
  const label = selected?.name ?? value.newName;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-11 w-full justify-between px-3 font-normal md:h-10"
        >
          {label ? (
            <span className="truncate">
              {label}
              {value.newName && !selected && <span className="ml-1.5 text-xs text-primary">new</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">Choose supplier</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or type a new name…" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-64">
            <CommandEmpty>{typed ? "Not in the list." : "No suppliers yet."}</CommandEmpty>
            {typed && !exact && (
              <CommandGroup>
                <CommandItem
                  value={`__add ${typed}`}
                  onSelect={() => {
                    onChange({ newName: typed });
                    setOpen(false);
                    setSearch("");
                  }}
                  className="py-2.5 text-primary"
                >
                  <Plus className="size-4" aria-hidden /> Add “{typed}”
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {suppliers.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.name} #${s.id}`}
                  onSelect={() => {
                    onChange({ supplierId: s.id });
                    setOpen(false);
                    setSearch("");
                  }}
                  className="py-2.5"
                >
                  <Check className={cn("size-4", selected?.id === s.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {label && (
              <CommandGroup>
                <CommandItem
                  value="__none"
                  onSelect={() => {
                    onChange({});
                    setOpen(false);
                  }}
                  className="py-2.5 text-muted-foreground"
                >
                  <X className="size-4" aria-hidden /> No supplier
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
