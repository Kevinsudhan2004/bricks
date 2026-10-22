import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { FormSkeleton } from "@/components/common/skeletons";
import { getCurrentUser } from "@/lib/auth";
import { intParam, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { getActiveMasters, getCompany, getCustomerOptions } from "@/server/queries/masters";
import { InvoiceForm } from "../order-form";

export const metadata: Metadata = { title: "New order" };

export default function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  return (
    <>
      <PageHeader
        title="New order"
        description="Note down what the customer ordered. Bricks can then be dispatched against this order in many trucks."
        backHref="/orders"
        backLabel="Orders"
      />
      <Suspense fallback={<FormSkeleton />}>
        <NewOrder searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewOrder({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, t, user, company, masters, customers] = await Promise.all([
    searchParams,
    today(),
    getCurrentUser(),
    getCompany(),
    getActiveMasters(),
    getCustomerOptions(),
  ]);
  const isOwner = user.role === "owner";
  const preset = customers.find((c) => c.id === intParam(sp, "customer"));
  const inter = !!(
    preset?.stateName &&
    company?.stateName &&
    preset.stateName.trim().toLowerCase() !== company.stateName.trim().toLowerCase()
  );
  return (
    <InvoiceForm
      customers={customers}
      // Employees never receive rates: the server applies them.
      products={masters.products.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        size: p.size,
        defaultRate: isOwner ? p.defaultRate : 0,
        gstRate: isOwner ? p.gstRate : 0,
      }))}
      companyState={company?.stateName ?? null}
      defaultDueDays={company?.defaultDueDays ?? 15}
      today={t}
      showMoney={isOwner}
      initial={preset ? { customerId: preset.id, deliveryAddress: preset.siteAddress ?? "", taxType: inter ? "inter" : "intra" } : undefined}
    />
  );
}
