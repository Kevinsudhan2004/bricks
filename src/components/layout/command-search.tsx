"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Search, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useQuickEntry } from "@/components/entry/quick-entry";
import { navFor, QUICK_ADD, type NavItem } from "./nav-config";
import { useUser } from "./user-provider";

type SearchResult = {
  customers: { id: number; name: string; sub: string }[];
  invoices: { id: number; no: string; sub: string }[];
  dispatches: { id: number; no: string; sub: string }[];
};
const EMPTY: SearchResult = { customers: [], invoices: [], dispatches: [] };

/** Ctrl/⌘+K search across customers, invoices, challans and vehicle numbers (owner only). */
export function CommandSearch() {
  const user = useUser();
  const router = useRouter();
  const openEntry = useQuickEntry();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult>(EMPTY);
  const [pending, startTransition] = useTransition();
  const isOwner = user.role === "owner";

  useEffect(() => {
    if (!isOwner) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOwner]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
          if (res.ok) setResults(await res.json());
        } catch {
          /* aborted or offline */
        }
      });
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const pages = useMemo(() => {
    const all: NavItem[] = [...navFor(user.role).flatMap((g) => g.items), ...QUICK_ADD.map((q) => ({ ...q, title: `New ${q.title.toLowerCase()}` }))];
    const q = query.trim().toLowerCase();
    return q ? all.filter((p) => p.title.toLowerCase().includes(q)) : all.slice(0, 8);
  }, [user.role, query]);

  if (!isOwner) return null;
  const shown = query.trim().length >= 2 ? results : EMPTY;

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        className="hidden h-9 w-52 justify-start gap-2 overflow-hidden text-muted-foreground md:flex xl:w-72"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">Search customers, orders…</span>
        <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 font-mono text-[10px] xl:inline">Ctrl K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Search">
        <Search aria-hidden />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search customers, orders and dispatches">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Customer, order no, DC no, vehicle…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[60vh]">
            {pending && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Searching…
              </div>
            )}
            <CommandEmpty>No matches.</CommandEmpty>
            {shown.customers.length > 0 && (
              <CommandGroup heading="Customers">
                {shown.customers.map((c) => (
                  <CommandItem key={`c${c.id}`} value={`c${c.id}`} onSelect={() => go(`/customers/${c.id}`)}>
                    <Users aria-hidden />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{c.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {shown.invoices.length > 0 && (
              <CommandGroup heading="Orders">
                {shown.invoices.map((i) => (
                  <CommandItem key={`i${i.id}`} value={`i${i.id}`} onSelect={() => go(`/orders/${i.id}`)}>
                    <FileText aria-hidden />
                    <span className="font-mono text-xs">{i.no}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{i.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {shown.dispatches.length > 0 && (
              <CommandGroup heading="Dispatches">
                {shown.dispatches.map((d) => (
                  <CommandItem key={`d${d.id}`} value={`d${d.id}`} onSelect={() => go(`/dispatch/${d.id}`)}>
                    <Truck aria-hidden />
                    <span className="font-mono text-xs">{d.no}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{d.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {pages.length > 0 && (
              <CommandGroup heading="Go to">
                {pages.map((p) => (
                  <CommandItem
                    key={p.href + p.title}
                    value={p.href + p.title}
                    onSelect={() => {
                      const { entry } = p;
                      if (!entry) return go(p.href);
                      setOpen(false);
                      setQuery("");
                      openEntry({ kind: entry });
                    }}
                  >
                    <p.icon aria-hidden />
                    {p.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
