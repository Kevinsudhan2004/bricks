"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChoiceCards, FormField, FormFooter, FormSection, type SheetMode } from "@/components/forms/form-parts";
import { SupplierPicker } from "@/components/forms/supplier-picker";
import { computeInvoiceTotals } from "@/domain/invoice";
import { materialColor } from "@/lib/colors";
import { amountInWords, formatDateShort, formatINR, formatNumber, formatTonnes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { purchaseBillSchema, type PurchaseBillInput } from "@/lib/validators";
import { createPurchaseBill, updatePurchaseBill } from "@/server/actions/purchases";
import type { BillLoad } from "@/server/queries/purchases";

type Output = z.output<typeof purchaseBillSchema>;
type Material = { id: number; name: string; code: string };
type Supplier = { id: number; name: string; gstin: string | null };
type LastRate = { supplierId: number; materialId: number; ratePerTon: number; gstRate: number };

const n = (v: unknown) => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};
/** kg → tonnes with at most 3 decimals, as typed in the form. */
const toTonnes = (kg: number) => Math.round(kg) / 1000;

export function BillForm({
  suppliers,
  materials,
  unbilled,
  lastRates,
  companyStateCode,
  today,
  billId,
  ownLoads = [],
  initial,
  sheet,
}: {
  suppliers: Supplier[];
  materials: Material[];
  /** Loads not on any bill yet, by supplier. */
  unbilled: Record<number, BillLoad[]>;
  lastRates: LastRate[];
  companyStateCode: string | null;
  today: string;
  billId?: number;
  /** When editing: the loads already on this bill (they can be unticked). */
  ownLoads?: BillLoad[];
  initial?: Partial<PurchaseBillInput>;
  sheet?: SheetMode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = billId !== undefined;

  const form = useForm<PurchaseBillInput, unknown, Output>({
    resolver: zodResolver(purchaseBillSchema),
    defaultValues: {
      supplierId: undefined,
      supplierBillNo: "",
      billDate: today,
      dueDate: "",
      taxType: "intra",
      transportCharges: "",
      notes: "",
      items: [],
      loadIds: [],
      ...initial,
    },
  });
  const { register, control, handleSubmit, formState, setError, setValue, getValues } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const errors = formState.errors;
  const [supplierId, items, loadIds, transport, taxType, billDate] = useWatch({
    control,
    name: ["supplierId", "items", "loadIds", "transportCharges", "taxType", "billDate"],
  });
  const sid = supplierId ? Number(supplierId) : undefined;
  const ticked = useMemo(() => new Set((loadIds ?? []).map(Number)), [loadIds]);

  // Loads that can go on this bill: the supplier's unbilled loads plus (when editing) this bill's own.
  const loads = useMemo(() => {
    if (!sid) return [];
    const own = ownLoads.filter((l) => l.supplierId === sid);
    const ownIds = new Set(own.map((l) => l.id));
    return [...own, ...(unbilled[sid] ?? []).filter((l) => !ownIds.has(l.id))].sort(
      (a, b) => a.entryDate.localeCompare(b.entryDate) || a.id - b.id,
    );
  }, [sid, unbilled, ownLoads]);
  const material = (id: number) => materials.find((m) => m.id === id);
  const kgTicked = (materialId: number) => loads.filter((l) => ticked.has(l.id) && l.materialId === materialId).reduce((a, l) => a + l.netKg, 0);

  const rateFor = (materialId: number, supplier = sid) =>
    lastRates.find((r) => r.supplierId === supplier && r.materialId === materialId) ?? lastRates.find((r) => r.materialId === materialId);

  /** Keep one line per ticked material, with tonnes = what was weighed in. */
  const syncLines = (nextTicked: Set<number>) => {
    const current = getValues("items") ?? [];
    const byMaterial = new Map<number, number>();
    for (const l of loads) if (nextTicked.has(l.id)) byMaterial.set(l.materialId, (byMaterial.get(l.materialId) ?? 0) + l.netKg);
    current.forEach((line, i) => {
      const kg = byMaterial.get(n(line.materialId));
      if (kg !== undefined) setValue(`items.${i}.quantityTonnes`, toTonnes(kg), { shouldValidate: formState.isSubmitted });
    });
    for (const [materialId, kg] of byMaterial) {
      if (current.some((line) => n(line.materialId) === materialId)) continue;
      const last = rateFor(materialId);
      append({ materialId, quantityTonnes: toTonnes(kg), ratePerTon: last?.ratePerTon ?? "", gstRate: last?.gstRate ?? "" });
    }
  };

  const setTicked = (next: Set<number>) => {
    setValue("loadIds", [...next]);
    syncLines(next);
  };

  const onSupplier = (id: number) => {
    setValue("supplierId", id, { shouldValidate: formState.isSubmitted });
    setValue("loadIds", []);
    setValue("items", []);
    const s = suppliers.find((x) => x.id === id);
    const theirState = s?.gstin?.slice(0, 2);
    setValue("taxType", theirState && companyStateCode && theirState !== companyStateCode ? "inter" : "intra");
  };

  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        items: (items ?? []).map((i) => ({ productId: n(i.materialId), quantity: n(i.quantityTonnes), rate: n(i.ratePerTon), gstRate: n(i.gstRate) })),
        transportCharges: n(transport),
        taxType: (taxType as "intra" | "inter") ?? "intra",
      }),
    [items, transport, taxType],
  );
  const usedMaterials = new Set((items ?? []).map((i) => n(i.materialId)));
  const unusedMaterials = materials.filter((m) => !usedMaterials.has(m.id));
  const tickable = loads.filter((l) => l.entryDate <= (billDate || today));

  const onSubmit = (values: Output) =>
    start(async () => {
      const res = editing ? await updatePurchaseBill(billId, values) : await createPurchaseBill(values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as never, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      if (sheet) sheet.onDone(res.data.id);
      else router.push(`/purchases/${res.data.id}`);
    });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className={sheet ? "space-y-4" : "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"}
    >
      <div className="min-w-0 space-y-4">
        <FormSection title="Supplier bill">
          <FormField label="Supplier" error={errors.supplierId?.message} required htmlFor="bill-supplier">
            <SupplierPicker
              id="bill-supplier"
              suppliers={suppliers}
              allowNew={false}
              invalid={!!errors.supplierId}
              value={{ supplierId: sid }}
              onChange={(v) => v.supplierId && onSupplier(v.supplierId)}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Their bill / invoice no." error={errors.supplierBillNo?.message} htmlFor="supplierBillNo">
              <Input id="supplierBillNo" autoComplete="off" placeholder="As printed" {...register("supplierBillNo")} />
            </FormField>
            <FormField label="Bill date" error={errors.billDate?.message} required htmlFor="billDate">
              <Input id="billDate" type="date" max={today} {...register("billDate")} />
            </FormField>
            <FormField label="Pay by" error={errors.dueDate?.message} hint="Their credit period" htmlFor="dueDate">
              <Input id="dueDate" type="date" {...register("dueDate")} />
            </FormField>
          </div>
        </FormSection>

        {sid && (
          <FormSection
            title="Loads on this bill"
            description="Tick the loads weighed in at the gate that this bill charges for. Tonnes below fill in from them."
          >
            {loads.length === 0 ? (
              <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                No unbilled loads from this supplier. You can still enter the bill by adding materials below.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setTicked(new Set(tickable.map((l) => l.id)))}>
                    Tick all up to bill date ({tickable.length})
                  </Button>
                  {ticked.size > 0 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setTicked(new Set())}>
                      Clear
                    </Button>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {ticked.size} of {loads.length} ticked
                  </span>
                </div>
                <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                  {loads.map((l) => {
                    const m = material(l.materialId);
                    const checked = ticked.has(l.id);
                    return (
                      <li key={l.id}>
                        <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm", checked && "bg-accent/50")}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = new Set(ticked);
                              if (v) next.add(l.id);
                              else next.delete(l.id);
                              setTicked(next);
                            }}
                            aria-label={`Load ${formatDateShort(l.entryDate)} ${m?.name ?? ""} ${formatNumber(l.netKg)} kg`}
                          />
                          <span className="w-14 shrink-0 text-muted-foreground">{formatDateShort(l.entryDate)}</span>
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: materialColor(m?.code ?? "") }} aria-hidden />
                            <span className="truncate">{m?.name}</span>
                            {(l.vehicleNo || l.challanNo) && (
                              <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                                · {[l.vehicleNo, l.challanNo].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </span>
                          <span className="num shrink-0 font-medium">{formatNumber(l.netKg)} kg</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </FormSection>
        )}

        <FormSection title="Materials billed" description="Tonnes, rate per tonne and GST, as on the supplier's bill.">
          <div className="space-y-3">
            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground">{sid ? "Tick loads above or add a material." : "Pick the supplier first."}</p>
            )}
            {fields.map((field, i) => {
              const materialId = n(items?.[i]?.materialId);
              const m = material(materialId);
              const weighed = kgTicked(materialId);
              const typedKg = n(items?.[i]?.quantityTonnes) * 1000;
              const differs = weighed > 0 && Math.abs(typedKg - weighed) >= 1;
              const lineAmount = n(items?.[i]?.quantityTonnes) * n(items?.[i]?.ratePerTon);
              const e = errors.items?.[i];
              return (
                <div key={field.id} className="rounded-lg border bg-background p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="h-6 w-1 rounded-full" style={{ background: materialColor(m?.code ?? "", i) }} aria-hidden />
                    <span className="flex-1 font-medium">{m?.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${m?.name ?? "material"}`}
                      onClick={() => {
                        // Untick this material's loads too, so the bill stays consistent.
                        const next = new Set([...ticked].filter((id) => loads.find((l) => l.id === id)?.materialId !== materialId));
                        setValue("loadIds", [...next]);
                        remove(i);
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.2fr_1.2fr_0.8fr_1.2fr]">
                    <FormField
                      label="Tonnes"
                      error={e?.quantityTonnes?.message}
                      hint={weighed > 0 ? `Weighed in: ${formatTonnes(weighed)}` : undefined}
                      htmlFor={`qty-${i}`}
                    >
                      <Input id={`qty-${i}`} inputMode="decimal" placeholder="0.000" className="num" {...register(`items.${i}.quantityTonnes`)} />
                    </FormField>
                    <FormField label="Rate / tonne (₹)" error={e?.ratePerTon?.message} htmlFor={`rate-${i}`}>
                      <Input id={`rate-${i}`} inputMode="decimal" className="num" {...register(`items.${i}.ratePerTon`)} />
                    </FormField>
                    <FormField label="GST %" error={e?.gstRate?.message} htmlFor={`gst-${i}`}>
                      <Input id={`gst-${i}`} inputMode="decimal" placeholder="0" className="num" {...register(`items.${i}.gstRate`)} />
                    </FormField>
                    <div className="space-y-1.5">
                      <p className="text-[13px] font-medium">Amount</p>
                      <p className="num flex h-11 items-center justify-end font-semibold md:h-9">{formatINR(lineAmount)}</p>
                    </div>
                  </div>
                  {differs && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning-foreground dark:text-warning">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                      Billed {formatTonnes(typedKg)} but {formatTonnes(weighed)} was weighed in at the gate.
                    </p>
                  )}
                </div>
              );
            })}
            {errors.items?.message && <p className="text-xs font-medium text-destructive">{errors.items.message}</p>}
            {sid && unusedMaterials.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {unusedMaterials.map((m) => (
                  <Button
                    key={m.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const last = rateFor(m.id);
                      append({ materialId: m.id, quantityTonnes: "", ratePerTon: last?.ratePerTon ?? "", gstRate: last?.gstRate ?? "" });
                    }}
                  >
                    <Plus aria-hidden /> Add {m.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </FormSection>

        <FormSection title="Tax & charges">
          <Controller
            control={control}
            name="taxType"
            render={({ field }) => (
              <ChoiceCards
                name="Tax type"
                columns={2}
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: "intra", label: "Same state", sub: "CGST + SGST" },
                  { value: "inter", label: "Other state", sub: "IGST" },
                ]}
              />
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="Transport / freight on the bill (₹)"
              error={errors.transportCharges?.message}
              hint="Taxed at the main material's GST rate"
              htmlFor="bill-transport"
            >
              <Input id="bill-transport" inputMode="decimal" placeholder="0" className="num" {...register("transportCharges")} />
            </FormField>
            <FormField label="Notes" error={errors.notes?.message} htmlFor="bill-notes">
              <Textarea id="bill-notes" rows={2} placeholder="e.g. Rate agreed on phone" {...register("notes")} />
            </FormField>
          </div>
        </FormSection>
      </div>

      <aside className={sheet ? "space-y-4" : "space-y-4 lg:sticky lg:top-20"}>
        <section className="rounded-xl border bg-card p-4 shadow-xs md:p-5" aria-live="polite">
          <h2 className="font-semibold">Bill total</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Materials" value={formatINR(totals.subtotal)} />
            {totals.transportCharges > 0 && <Row label="Transport" value={formatINR(totals.transportCharges)} />}
            {taxType === "inter" ? (
              <Row label="IGST" value={formatINR(totals.igst)} />
            ) : (
              <>
                <Row label="CGST" value={formatINR(totals.cgst)} />
                <Row label="SGST" value={formatINR(totals.sgst)} />
              </>
            )}
            {totals.roundOff !== 0 && <Row label="Round off" value={formatINR(totals.roundOff)} muted />}
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t pt-3">
            <span className="font-medium">To pay</span>
            <span className="num text-2xl font-semibold">{formatINR(totals.total)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{amountInWords(totals.total)}</p>
          {ticked.size > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {ticked.size} load{ticked.size === 1 ? "" : "s"} will be marked as billed.
            </p>
          )}
        </section>
        <FormFooter sheet={!!sheet} className={sheet ? undefined : "lg:flex-col lg:items-stretch"}>
          <Button type="button" variant="outline" size="lg" onClick={() => (sheet ? sheet.onCancel() : router.back())} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />}
            Save bill
          </Button>
        </FormFooter>
      </aside>
    </form>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={muted ? "num text-muted-foreground" : "num font-medium"}>{value}</dd>
    </div>
  );
}
