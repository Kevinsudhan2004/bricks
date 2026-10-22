import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { FormSkeleton } from "@/components/common/skeletons";
import { getCurrentUser } from "@/lib/auth";
import { getCompany } from "@/server/queries/masters";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "New customer" };

export default function NewCustomerPage({ searchParams }: PageProps<"/customers/new">) {
  return (
    <>
      <PageHeader title="Add customer" backHref="/customers" backLabel="Customers" className="mx-auto max-w-3xl" />
      <Suspense fallback={<FormSkeleton />}>
        <NewCustomer searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewCustomer({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, company, sp] = await Promise.all([getCurrentUser(), getCompany(), searchParams]);
  const isOwner = user.role === "owner";
  const returnTo = typeof sp.returnTo === "string" && sp.returnTo.startsWith("/") ? sp.returnTo : isOwner ? undefined : "/customers";
  return <CustomerForm defaultState={company?.stateName} returnTo={returnTo} showMoney={isOwner} />;
}
