"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CustomerPicker, type CustomerOption } from "@/components/forms/customer-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChoiceCards, FormField, FormFooter, FormSection, type SheetMode } from "@/components/forms/form-parts";
import { addDays } from "@/domain/dates";
import { computeInvoiceTotals } from "@/domain/invoice";
import { productColor } from "@/lib/colors";
import { amountInWords, formatINR } from "@/lib/format";
import { invoiceSchema, type InvoiceInput } from "@/lib/validators";
import { createInvoice, updateInvoice } from "@/server/actions/invoices";
import { CustomerForm } from "../customers/customer-form";

type Product = { id: number; name: string; code: string; size: string | null; defaultRate: number; gstRate: number };
type Output = z.output<typeof invoiceSchema>;

const n = (v: unknown) => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

export function InvoiceForm({
  customers,
  products,
  companyState,
  defaultDueDays,
  today,
  invoiceId,
  initial,
  deliveredByProduct,
  showMoney = true,
  sheet,
}: {
  customers: CustomerOption[];
  products: Product[];
  companyState: string | null;
  defaultDueDays: number;
  today: string;
  invoiceId?: number;
  initial?: Partial<InvoiceInput>;
  deliveredByProduct?: Record<number, number>;
  /** Owners see and set rates, GST and totals; employees only record what was ordered. */
  showMoney?: boolean;
  sheet?: SheetMode;
}) {
  const router = useRouter();
  // Customers added from inside the form join the picker straight away.
  const [added, setAdded] = useState<CustomerOption[]>([]);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const customerList = useMemo(() => [...added, ...customers], [added, customers]);
  const [pending, start] = useTransition();
  const editing = invoiceId !== undefined;

  const form = useForm<InvoiceInput, unknown, Output>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      customerId: undefined,
      invoiceDate: today,
      dueDate: showMoney ? addDays(today, defaultDueDays) : "",
      deliveryAddress: "",
      taxType: "intra",
      transportCharges: "",
      notes: "",
      items: products[0]
        ? [{ productId: products[0].id, quantity: "", rate: showMoney ? products[0].defaultRate : "", gstRate: showMoney ? products[0].gstRate : "" }]
        : [],
      ...initial,
    },
  });
  const { register, control, handleSubmit, formState, setError, setValue, getValues } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const errors = formState.errors;
  const [items, transport, taxType] = useWatch({ control, name: ["items", "transportCharges", "taxType"] });

  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        items: (items ?? []).map((i) => ({
          productId: n(i.productId),
          quantity: n(i.quantity),
          rate: n(i.rate),
          gstRate: n(i.gstRate),
        })),
        transportCharges: n(transport),
        taxType: (taxType as "intra" | "inter") ?? "intra",
      }),
    [items, transport, taxType],
  );

  const usedProducts = new Set((items ?? []).map((i) => n(i.productId)));
  const unusedProducts = products.filter((p) => !usedProducts.has(p.id));
  const totalBricks = (items ?? []).reduce((a, i) => a + n(i.quantity), 0);

  const onCustomer = (c: CustomerOption) => {
    setValue("customerId", c.id, { shouldValidate: true });
    if (!getValues("deliveryAddress")) setValue("deliveryAddress", c.siteAddress ?? "");
    const inter = !!(c.stateName && companyState && c.stateName.trim().toLowerCase() !== companyState.trim().toLowerCase());
    setValue("taxType", inter ? "inter" : "intra");
  };

  const onSubmit = (values: Output) =>
    start(async () => {
      const res = editing ? await updateInvoice(invoiceId, values) : await createInvoice(values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as never, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      if (sheet) sheet.onDone(res.data.id);
      else router.push(`/orders/${res.data.id}`);
    });

  return (
    <>
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className={sheet ? "space-y-4" : "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"}
    >
      <div className="min-w-0 space-y-4">
        <FormSection title="Order">
          <FormField label="Customer" error={errors.customerId?.message} required htmlFor="customer">
            <Controller
              control={control}
              name="customerId"
              render={({ field }) => (
                <CustomerPicker
                  id="customer"
                  customers={customerList}
                  value={field.value ? Number(field.value) : undefined}
                  onChange={onCustomer}
                  invalid={!!errors.customerId}
                  newHref="/customers/new?returnTo=/orders/new"
                  onNew={sheet ? () => setAddingCustomer(true) : undefined}
                />
              )}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Order date" error={errors.invoiceDate?.message} required htmlFor="invoiceDate">
              <Input
                id="invoiceDate"
                type="date"
                {...register("invoiceDate", {
                  onChange: (e) => {
                    if (!editing && showMoney && e.target.value) setValue("dueDate", addDays(e.target.value, defaultDueDays));
                  },
                })}
              />
            </FormField>
            {showMoney && (
              <FormField label="Payment due by" error={errors.dueDate?.message} htmlFor="dueDate">
                <Input id="dueDate" type="date" {...register("dueDate")} />
              </FormField>
            )}
          </div>
          <FormField label="Delivery site" error={errors.deliveryAddress?.message} htmlFor="deliveryAddress">
            <Textarea id="deliveryAddress" rows={2} {...register("deliveryAddress")} />
          </FormField>
        </FormSection>

        <FormSection
          title="Bricks ordered"
          description={showMoney ? "Quantity, rate per brick/block and GST." : "How many of each product the customer ordered."}
        >
          <div className="space-y-3">
            {fields.map((field, i) => {
              const productId = n(items?.[i]?.productId);
              const product = products.find((p) => p.id === productId);
              const lineAmount = n(items?.[i]?.quantity) * n(items?.[i]?.rate);
              const minQty = deliveredByProduct?.[productId] ?? 0;
              const e = errors.items?.[i];
              return (
                <div key={field.id} className="rounded-lg border bg-background p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="h-6 w-1 rounded-full" style={{ background: productColor(product?.code ?? "", i) }} aria-hidden />
                    <Controller
                      control={control}
                      name={`items.${i}.productId`}
                      render={({ field: f }) => (
                        <Select
                          value={String(f.value ?? "")}
                          onValueChange={(v) => {
                            const p = products.find((x) => x.id === Number(v));
                            f.onChange(Number(v));
                            if (p && showMoney) {
                              setValue(`items.${i}.rate`, p.defaultRate);
                              setValue(`items.${i}.gstRate`, p.gstRate);
                            }
                          }}
                        >
                          <SelectTrigger className="flex-1" aria-label="Product">
                            <SelectValue placeholder="Product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products
                              .filter((p) => p.id === f.value || !usedProducts.has(p.id))
                              .map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  {p.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {fields.length > 1 && minQty === 0 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove product">
                        <Trash2 aria-hidden />
                      </Button>
                    )}
                  </div>
                  <div className={showMoney ? "grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr_1.2fr]" : "grid grid-cols-1 gap-3"}>
                    <FormField
                      label="Quantity"
                      error={e?.quantity?.message}
                      hint={minQty ? `${minQty.toLocaleString("en-IN")} already delivered` : undefined}
                      htmlFor={`qty-${i}`}
                    >
                      <Input
                        id={`qty-${i}`}
                        inputMode="numeric"
                        placeholder="0"
                        className={showMoney ? "num" : "num text-lg font-semibold"}
                        {...register(`items.${i}.quantity`)}
                      />
                    </FormField>
                    {showMoney && (
                      <>
                        <FormField label="Rate (₹)" error={e?.rate?.message} htmlFor={`rate-${i}`}>
                          <Input id={`rate-${i}`} inputMode="decimal" className="num" {...register(`items.${i}.rate`)} />
                        </FormField>
                        <FormField label="GST %" error={e?.gstRate?.message} htmlFor={`gst-${i}`}>
                          <Input id={`gst-${i}`} inputMode="decimal" className="num" {...register(`items.${i}.gstRate`)} />
                        </FormField>
                        <div className="space-y-1.5">
                          <p className="text-[13px] font-medium">Amount</p>
                          <p className="num flex h-11 items-center justify-end font-semibold md:h-9">{formatINR(lineAmount)}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {errors.items?.message && <p className="text-xs font-medium text-destructive">{errors.items.message}</p>}
            {unusedProducts.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  append({
                    productId: unusedProducts[0].id,
                    quantity: "",
                    rate: showMoney ? unusedProducts[0].defaultRate : "",
                    gstRate: showMoney ? unusedProducts[0].gstRate : "",
                  })
                }
              >
                <Plus aria-hidden /> Add {unusedProducts[0].name}
              </Button>
            )}
          </div>
        </FormSection>

        {showMoney ? (
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
              label="Transport / loading charges (₹)"
              error={errors.transportCharges?.message}
              hint="Taxed at the main product's GST rate"
              htmlFor="transport"
            >
              <Input id="transport" inputMode="decimal" placeholder="0" className="num" {...register("transportCharges")} />
            </FormField>
            <FormField label="Notes (printed on the invoice)" error={errors.notes?.message} htmlFor="notes">
              <Textarea id="notes" rows={2} placeholder="e.g. Delivery in 4 loads" {...register("notes")} />
            </FormField>
          </div>
        </FormSection>
        ) : (
          <FormSection>
            <FormField label="Notes" error={errors.notes?.message} htmlFor="notes">
              <Textarea id="notes" rows={2} placeholder="e.g. Deliver in 4 loads, call before coming" {...register("notes")} />
            </FormField>
          </FormSection>
        )}
      </div>

      {/* Live totals */}
      <aside className={sheet ? "space-y-4" : "space-y-4 lg:sticky lg:top-20"}>
        {showMoney ? (
        <section className="rounded-xl border bg-card p-4 shadow-xs md:p-5" aria-live="polite">
          <h2 className="font-semibold">Summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label={`Bricks (${totalBricks.toLocaleString("en-IN")} nos)`} value={formatINR(totals.subtotal)} />
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
            <span className="font-medium">Total</span>
            <span className="num text-2xl font-semibold">{formatINR(totals.total)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{amountInWords(totals.total)}</p>
        </section>
        ) : (
          <section className="rounded-xl border bg-card p-4 shadow-xs md:p-5" aria-live="polite">
            <h2 className="font-semibold">Order total</h2>
            <p className="num mt-2 text-3xl font-semibold">{totalBricks.toLocaleString("en-IN")}</p>
            <p className="text-sm text-muted-foreground">bricks / blocks ordered</p>
          </section>
        )}
        <FormFooter sheet={!!sheet} className={sheet ? undefined : "lg:flex-col lg:items-stretch"}>
          <Button type="button" variant="outline" size="lg" onClick={() => (sheet ? sheet.onCancel() : router.back())} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />}
            Save order
          </Button>
        </FormFooter>
      </aside>
    </form>
    {sheet && (
      <Dialog open={addingCustomer} onOpenChange={setAddingCustomer}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
          </DialogHeader>
          {addingCustomer && (
            <CustomerForm
              defaultState={companyState}
              showMoney={showMoney}
              sheet={{
                onDone: (c) => {
                  setAdded((list) => [c, ...list]);
                  onCustomer(c);
                  setAddingCustomer(false);
                },
                onCancel: () => setAddingCustomer(false),
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    )}
    </>
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
