"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { CustomerOption } from "@/components/forms/customer-picker";
import type { SheetMode } from "@/components/forms/form-parts";
import { useIsMobile } from "@/hooks/use-mobile";
import type { InvoiceBalanceOption } from "@/server/queries/money";

const CustomerForm = dynamic(() => import("@/app/(app)/customers/customer-form").then((m) => m.CustomerForm), { loading: FormLoading });
const InvoiceForm = dynamic(() => import("@/app/(app)/orders/order-form").then((m) => m.InvoiceForm), { loading: FormLoading });
const PaymentForm = dynamic(() => import("@/app/(app)/payments/payment-form").then((m) => m.PaymentForm), { loading: FormLoading });
const NoteForm = dynamic(() => import("@/app/(app)/notes/note-form").then((m) => m.NoteForm), { loading: FormLoading });

export type EntryKind = "customer" | "order" | "payment" | "credit" | "debit";
export type EntryRequest = { kind: EntryKind; customerId?: number; invoiceId?: number };

const COPY: Record<EntryKind, { title: string; description: string }> = {
  customer: { title: "New customer", description: "Contact, billing and site details." },
  order: { title: "New order", description: "What the customer ordered. Dispatch against it in as many trucks as needed." },
  payment: { title: "Record payment", description: "Money received from a customer." },
  credit: { title: "Credit / debit note", description: "Adjust a customer's balance: damage, returns, rate changes or extra charges." },
  debit: { title: "Credit / debit note", description: "Adjust a customer's balance: damage, returns, rate changes or extra charges." },
};

const OpenEntry = createContext<((req: EntryRequest) => void) | null>(null);

/** Open a new-entry form in a sheet over the current page. */
export function useQuickEntry() {
  const open = useContext(OpenEntry);
  if (!open) throw new Error("useQuickEntry must be used inside <QuickEntryProvider>");
  return open;
}

/**
 * One sheet for every "add" action — customers, orders, payments, credit/debit notes — so adding a
 * record never leaves the list you're looking at. Slides in from the right on iPad/desktop, up from the bottom on phones.
 */
export function QuickEntryProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [request, setRequest] = useState<EntryRequest | null>(null);
  const [open, setOpen] = useState(false);
  // Each open gets a fresh form (and fresh customer/balance data).
  const [seq, setSeq] = useState(0);

  const openEntry = useCallback((req: EntryRequest) => {
    setRequest(req);
    setSeq((n) => n + 1);
    setOpen(true);
  }, []);

  const copy = request ? COPY[request.kind] : COPY.order;
  const side = isMobile ? "bottom" : "right";

  return (
    <OpenEntry.Provider value={openEntry}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={side}
          className={cn(
            "gap-0 p-0",
            side === "bottom"
              ? "rounded-t-2xl data-[side=bottom]:h-[94dvh]"
              : "data-[side=right]:w-full data-[side=right]:sm:max-w-xl data-[side=right]:lg:max-w-2xl",
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="border-b px-4 py-3 pr-12 md:px-6">
            <SheetTitle className="text-lg font-semibold">{copy.title}</SheetTitle>
            <SheetDescription>{copy.description}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 md:px-6">
            {request && <EntryBody key={seq} request={request} sheet={{ onDone: () => setOpen(false), onCancel: () => setOpen(false) }} />}
          </div>
        </SheetContent>
      </Sheet>
    </OpenEntry.Provider>
  );
}

/** A button that opens the entry sheet — usable from server components. */
export function NewEntryButton({
  kind,
  customerId,
  invoiceId,
  children,
  ...props
}: EntryRequest & Omit<React.ComponentProps<typeof Button>, "onClick" | "type">) {
  const openEntry = useQuickEntry();
  return (
    <Button type="button" {...props} onClick={() => openEntry({ kind, customerId, invoiceId })}>
      {children}
    </Button>
  );
}

type OrderData = {
  customers: CustomerOption[];
  products: { id: number; name: string; code: string; size: string | null; defaultRate: number; gstRate: number }[];
  companyState: string | null;
  defaultDueDays: number;
  today: string;
  showMoney: boolean;
};
type MoneyData = { customers: CustomerOption[]; balances: Record<number, InvoiceBalanceOption[]>; today: string };
type CustomerData = { defaultState: string | null; showMoney: boolean };

function EntryBody({ request, sheet }: { request: EntryRequest; sheet: SheetMode }) {
  const { kind, customerId, invoiceId } = request;
  const endpoint = kind === "credit" || kind === "debit" ? "note" : kind;
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/entry-form/${endpoint}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not load the form.");
        setData(body);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message || "Could not load the form. Check your connection.");
      });
    return () => ctrl.abort();
  }, [endpoint]);

  if (error) return <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>;
  if (!data) return <FormLoading />;

  if (kind === "customer") {
    const d = data as CustomerData;
    return <CustomerForm defaultState={d.defaultState} showMoney={d.showMoney} sheet={{ onDone: (c) => sheet.onDone(c.id), onCancel: sheet.onCancel }} />;
  }

  if (kind === "order") {
    const d = data as OrderData;
    const preset = d.customers.find((c) => c.id === customerId);
    const inter = !!(
      preset?.stateName &&
      d.companyState &&
      preset.stateName.trim().toLowerCase() !== d.companyState.trim().toLowerCase()
    );
    return (
      <InvoiceForm
        customers={d.customers}
        products={d.products}
        companyState={d.companyState}
        defaultDueDays={d.defaultDueDays}
        today={d.today}
        showMoney={d.showMoney}
        initial={preset ? { customerId: preset.id, deliveryAddress: preset.siteAddress ?? "", taxType: inter ? "inter" : "intra" } : undefined}
        sheet={sheet}
      />
    );
  }

  const d = data as MoneyData;
  if (kind === "payment") {
    const invoice = invoiceId ?? (customerId ? d.balances[customerId]?.find((i) => i.balance > 0)?.id : undefined);
    return (
      <PaymentForm
        customers={d.customers}
        balances={d.balances}
        today={d.today}
        initial={customerId ? { customerId, invoiceId: invoice } : undefined}
        sheet={sheet}
      />
    );
  }

  return (
    <NoteForm
      customers={d.customers}
      balances={d.balances}
      today={d.today}
      initial={{ type: kind, customerId, invoiceId, reason: kind === "debit" ? "transport" : "damaged" }}
      sheet={sheet}
    />
  );
}

function FormLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <span className="sr-only">Loading form</span>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-full md:h-9" />
          <Skeleton className="h-11 w-2/3 md:h-9" />
        </div>
      ))}
    </div>
  );
}
