import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { FormSkeleton } from "@/components/common/skeletons";
import { getCustomer } from "@/server/queries/customers";
import { CustomerForm } from "../../customer-form";

export const metadata: Metadata = { title: "Edit customer" };

export default function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditCustomer params={params} />
    </Suspense>
  );
}

async function EditCustomer({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const c = await getCustomer(id);
  if (!c) notFound();
  return (
    <>
      <PageHeader title={`Edit ${c.name}`} backHref={`/customers/${id}`} backLabel={c.name} className="mx-auto max-w-3xl" />
      <CustomerForm
        customerId={id}
        initial={{
          name: c.name,
          firmName: c.firmName ?? "",
          phone: c.phone ?? "",
          altPhone: c.altPhone ?? "",
          gstin: c.gstin ?? "",
          billingAddress: c.billingAddress ?? "",
          siteAddress: c.siteAddress ?? "",
          stateName: c.stateName ?? "",
          openingBalance: c.openingBalance || "",
          notes: c.notes ?? "",
        }}
      />
    </>
  );
}
