import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/common/page-header";
import { FormSkeleton } from "@/components/common/skeletons";
import { getCurrentUser } from "@/lib/auth";
import { today } from "@/lib/today";
import { canModifyEntry } from "@/server/permissions";
import { getInvoiceDetail } from "@/server/queries/invoices";
import { getActiveMasters, getAllCustomerOptions, getCompany, getCustomerOptions } from "@/server/queries/masters";
import { InvoiceForm } from "../../order-form";

export const metadata: Metadata = { title: "Edit order" };

export default function EditOrderPage({ params }: PageProps<"/orders/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditOrder params={params} />
    </Suspense>
  );
}

async function EditOrder({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [user, inv, t, company, masters] = await Promise.all([
    getCurrentUser(),
    getInvoiceDetail(id),
    today(),
    getCompany(),
    getActiveMasters(),
  ]);
  if (!inv) notFound();
  const isOwner = user.role === "owner";
  const header = <PageHeader title={`Edit ${inv.invoiceNo}`} backHref={`/orders/${id}`} backLabel={inv.invoiceNo} />;
  const blocked =
    inv.status === "cancelled"
      ? "This order is cancelled and can't be edited."
      : !canModifyEntry(user, inv, t)
        ? "You can only change orders you entered today. Please ask the owner to correct this one."
        : null;
  if (blocked) {
    return (
      <>
        {header}
        <Alert>
          <AlertDescription>{blocked}</AlertDescription>
        </Alert>
      </>
    );
  }
  const customers = isOwner ? await getAllCustomerOptions() : await getCustomerOptions();
  const delivered: Record<number, number> = {};
  for (const d of inv.dispatches) for (const it of d.items) delivered[it.productId] = (delivered[it.productId] ?? 0) + it.quantity;
  // Include products that are inactive now but already on this order
  const productIds = new Set(masters.products.map((p) => p.id));
  const products = [
    ...masters.products,
    ...inv.items
      .filter((i) => !productIds.has(i.productId))
      .map((i) => ({ id: i.productId, name: i.productName, code: i.productCode, size: i.size, defaultRate: i.rate, gstRate: i.gstRate })),
  ].map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    size: p.size,
    defaultRate: isOwner ? p.defaultRate : 0,
    gstRate: isOwner ? p.gstRate : 0,
  }));
  return (
    <>
      {header}
      <InvoiceForm
        invoiceId={id}
        customers={customers}
        products={products}
        companyState={company?.stateName ?? null}
        defaultDueDays={company?.defaultDueDays ?? 15}
        today={t}
        showMoney={isOwner}
        deliveredByProduct={delivered}
        initial={{
          customerId: inv.customerId,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate ?? "",
          deliveryAddress: inv.deliveryAddress ?? "",
          taxType: inv.taxType,
          transportCharges: isOwner ? inv.transportCharges || "" : "",
          notes: inv.notes ?? "",
          items: inv.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            rate: isOwner ? i.rate : "",
            gstRate: isOwner ? i.gstRate : "",
          })),
        }}
      />
    </>
  );
}
