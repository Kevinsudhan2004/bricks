import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/common/page-header";
import { FormSkeleton } from "@/components/common/skeletons";
import { requireOwner } from "@/lib/auth";
import { today } from "@/lib/today";
import { getActiveMasters, getCompany } from "@/server/queries/masters";
import { getBillDetail, getLastRates, getUnbilledLoadsBySupplier } from "@/server/queries/purchases";
import { BillForm } from "../../bill-form";

export const metadata: Metadata = { title: "Edit bill" };

export default function EditBillPage({ params }: PageProps<"/purchases/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditBill params={params} />
    </Suspense>
  );
}

async function EditBill({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [bill, t, company, masters, unbilled, lastRates] = await Promise.all([
    getBillDetail(id),
    today(),
    getCompany(),
    getActiveMasters(),
    getUnbilledLoadsBySupplier(),
    getLastRates(),
  ]);
  if (!bill) notFound();
  const header = <PageHeader title={`Edit ${bill.billNo}`} backHref={`/purchases/${id}`} backLabel={bill.billNo} />;
  const blocked =
    bill.status === "cancelled"
      ? "This bill is cancelled and can't be edited."
      : bill.closedAt
        ? "This bill is closed and locked. Reopen it from the bill page to edit it."
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

  // Keep inactive suppliers / materials that are already on this bill selectable.
  const suppliers = masters.suppliers.some((s) => s.id === bill.supplierId) ? masters.suppliers : [bill.supplier, ...masters.suppliers];
  const materialIds = new Set(masters.materials.map((m) => m.id));
  const materials = [
    ...masters.materials.map((m) => ({ id: m.id, name: m.name, code: m.code })),
    ...bill.items.filter((i) => !materialIds.has(i.materialId)).map((i) => ({ id: i.materialId, name: i.materialName, code: i.materialCode })),
  ];

  return (
    <>
      {header}
      <BillForm
        billId={id}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, gstin: s.gstin }))}
        materials={materials}
        unbilled={unbilled}
        lastRates={lastRates}
        companyStateCode={company?.stateCode ?? null}
        today={t}
        ownLoads={bill.loads.map((l) => ({
          id: l.id,
          entryDate: l.entryDate,
          supplierId: bill.supplierId,
          materialId: l.materialId,
          netKg: l.netKg,
          vehicleNo: l.vehicleNo,
          challanNo: l.challanNo,
        }))}
        initial={{
          supplierId: bill.supplierId,
          supplierBillNo: bill.supplierBillNo ?? "",
          billDate: bill.billDate,
          dueDate: bill.dueDate ?? "",
          taxType: bill.taxType,
          transportCharges: bill.transportCharges || "",
          notes: bill.notes ?? "",
          items: bill.items.map((i) => ({
            materialId: i.materialId,
            quantityTonnes: Math.round(i.quantityKg) / 1000,
            ratePerTon: i.ratePerTon,
            gstRate: i.gstRate,
          })),
          loadIds: bill.loads.map((l) => l.id),
        }}
      />
    </>
  );
}
