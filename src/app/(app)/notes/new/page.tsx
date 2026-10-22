import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { FormSkeleton } from "@/components/common/skeletons";
import { requireOwner } from "@/lib/auth";
import { intParam, strParam, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { getCustomerOptions } from "@/server/queries/masters";
import { getInvoiceBalancesByCustomer } from "@/server/queries/money";
import { NoteForm } from "../note-form";

export const metadata: Metadata = { title: "Credit / debit note" };

export default function NewNotePage({ searchParams }: PageProps<"/notes/new">) {
  return (
    <>
      <PageHeader
        title="Credit / debit note"
        description="Adjust a customer's balance — damaged bricks, returns, rate changes or extra charges."
        backHref="/notes"
        backLabel="Notes"
        className="mx-auto max-w-3xl"
      />
      <Suspense fallback={<FormSkeleton />}>
        <NewNote searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewNote({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const [sp, t] = await Promise.all([searchParams, today()]);
  const [customers, balances] = await Promise.all([getCustomerOptions(), getInvoiceBalancesByCustomer(t)]);
  const type = strParam(sp, "type") === "debit" ? "debit" : "credit";
  const customerId = intParam(sp, "customer") ?? undefined;
  const invoiceId = intParam(sp, "invoice") ?? undefined;
  return (
    <NoteForm
      customers={customers}
      balances={balances}
      today={t}
      initial={{ type, customerId, invoiceId, reason: type === "debit" ? "transport" : "damaged" }}
    />
  );
}
