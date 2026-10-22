import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/common/skeletons";
import { requireOwner } from "@/lib/auth";
import { getCompany } from "@/server/queries/masters";
import { CompanyForm } from "./editors";

export const metadata: Metadata = { title: "Settings" };

export default function CompanySettingsPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Company />
    </Suspense>
  );
}

async function Company() {
  await requireOwner();
  const c = await getCompany();
  return (
    <CompanyForm
      initial={{
        name: c?.name ?? "",
        tagline: c?.tagline ?? "",
        address: c?.address ?? "",
        phone: c?.phone ?? "",
        email: c?.email ?? "",
        gstin: c?.gstin ?? "",
        stateName: c?.stateName ?? "",
        stateCode: c?.stateCode ?? "",
        bankName: c?.bankName ?? "",
        bankAccount: c?.bankAccount ?? "",
        bankIfsc: c?.bankIfsc ?? "",
        upiId: c?.upiId ?? "",
        invoiceTerms: c?.invoiceTerms ?? "",
        defaultDueDays: c?.defaultDueDays ?? 15,
      }}
    />
  );
}
