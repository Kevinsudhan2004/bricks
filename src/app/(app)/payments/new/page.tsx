import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { FormSkeleton } from "@/components/common/skeletons";
import { requireOwner } from "@/lib/auth";
import { intParam, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { getCustomerOptions } from "@/server/queries/masters";
import { getInvoiceBalancesByCustomer } from "@/server/queries/money";
import { PaymentForm } from "../payment-form";

export const metadata: Metadata = { title: "Record payment" };

export default function NewPaymentPage({ searchParams }: PageProps<"/payments/new">) {
  return (
    <>
      <PageHeader title="Record payment" description="Money received from a customer." backHref="/payments" backLabel="Payments" className="mx-auto max-w-3xl" />
      <Suspense fallback={<FormSkeleton />}>
        <NewPayment searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewPayment({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const [sp, t] = await Promise.all([searchParams, today()]);
  const [customers, balances] = await Promise.all([getCustomerOptions(), getInvoiceBalancesByCustomer(t)]);
  const customerId = intParam(sp, "customer") ?? undefined;
  const invoiceId = intParam(sp, "invoice") ?? (customerId ? balances[customerId]?.find((i) => i.balance > 0)?.id : undefined);
  return <PaymentForm customers={customers} balances={balances} today={t} initial={customerId ? { customerId, invoiceId } : undefined} />;
}
