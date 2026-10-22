"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Check, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/forms/form-parts";
import { productColor } from "@/lib/colors";
import { formatNumber, pct } from "@/lib/format";
import { productionSchema, type ProductionData, type ProductionInput } from "@/lib/validators";
import { createProduction, updateProduction } from "@/server/actions/production";

type Product = { id: number; name: string; code: string; dailyCapacity: number };

type Props = {
  products: Product[];
  today: string;
  minDate?: string;
  /** Bricks already recorded today, per product id. */
  todayMade: Record<number, number>;
};

function ProductionFields({
  products,
  today,
  minDate,
  todayMade,
  initial,
  entryId,
  layout,
  onSaved,
}: Props & {
  initial?: Partial<ProductionInput>;
  entryId?: number;
  layout: "row" | "stacked";
  onSaved?: () => void;
}) {
  const [pending, start] = useTransition();
  const editing = entryId !== undefined;
  const key = entryId ?? "new";
  const row = layout === "row";

  const { register, control, handleSubmit, formState, setError, reset, setFocus } = useForm<
    ProductionInput,
    unknown,
    ProductionData
  >({
    resolver: zodResolver(productionSchema),
    defaultValues: { entryDate: today, productId: products[0]?.id, quantityProduced: "", quantityRejected: "", ...initial },
  });
  const e = formState.errors;
  const [productId, entryDate, made, broken] = useWatch({
    control,
    name: ["productId", "entryDate", "quantityProduced", "quantityRejected"],
  });
  const product = products.find((p) => p.id === Number(productId));
  const madeNum = Number(made) || 0;
  const brokenNum = Number(broken) || 0;
  // Running total for today against capacity (an edited entry's own old number doesn't count twice).
  const ownBefore = editing && initial?.productId === product?.id && initial?.entryDate === today ? Number(initial?.quantityProduced) || 0 : 0;
  const before = entryDate === today && product ? Math.max((todayMade[product.id] ?? 0) - ownBefore, 0) : 0;
  const dayTotal = before + madeNum;
  const usage = product ? pct(dayTotal, product.dailyCapacity) : 0;

  const onSubmit = (values: ProductionData) =>
    start(async () => {
      const res = editing ? await updateProduction(entryId, values) : await createProduction(values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof ProductionInput, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      for (const w of res.data.warnings) toast.warning(w);
      if (editing) {
        onSaved?.();
        return;
      }
      reset({ entryDate: values.entryDate, productId: values.productId, quantityProduced: "", quantityRejected: "" });
      setFocus("quantityProduced");
    });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className={cn("grid grid-cols-2 gap-3", row && "lg:grid-cols-[10.5rem_minmax(0,1.2fr)_minmax(0,1fr)_9rem_auto] lg:items-start")}
    >
      <FormField label="Date" error={e.entryDate?.message} className={cn("col-span-2 sm:col-span-1", row && "lg:col-span-1")} htmlFor={`pr-date-${key}`}>
        <Input
          id={`pr-date-${key}`}
          type="date"
          max={today}
          min={minDate}
          className="md:h-10"
          defaultValue={String(entryDate ?? today)}
          {...register("entryDate")}
        />
      </FormField>

      <FormField label="Product" error={e.productId?.message} className={cn("col-span-2 sm:col-span-1", row && "lg:col-span-1")} htmlFor={`pr-prod-${key}`}>
        <Controller
          control={control}
          name="productId"
          render={({ field }) => (
            <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(Number(v))}>
              <SelectTrigger id={`pr-prod-${key}`} className="w-full md:data-[size=default]:h-10">
                <SelectValue placeholder="Choose product">
                  {product && (
                    <>
                      <span className="size-2.5 rounded-full" style={{ background: productColor(product.code) }} aria-hidden />
                      {product.name}
                    </>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {products.map((p, i) => (
                  <SelectItem key={p.id} value={String(p.id)} className="py-2.5">
                    <span className="size-2.5 rounded-full" style={{ background: productColor(p.code, i) }} aria-hidden />
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>

      <FormField
        label="Bricks made"
        error={e.quantityProduced?.message}
        className={cn("col-span-2 sm:col-span-1", row && "lg:col-span-1")}
        htmlFor={`pr-made-${key}`}
        hint={
          product && (madeNum > 0 || before > 0) ? (
            <span className={cn(usage > 100 && "font-medium text-destructive")}>
              {madeNum === 0
                ? `Already today: ${formatNumber(before)} (${usage}% of ${formatNumber(product.dailyCapacity)})`
                : `${before > 0 ? `${formatNumber(before)} earlier + ${formatNumber(madeNum)} = ` : ""}${formatNumber(dayTotal)} · ${usage}% of ${formatNumber(product.dailyCapacity)}`}
            </span>
          ) : undefined
        }
      >
        <Input
          id={`pr-made-${key}`}
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 22000"
          className="num text-lg font-semibold md:h-10"
          {...register("quantityProduced")}
        />
      </FormField>

      <FormField
        label="Broken"
        error={e.quantityRejected?.message}
        className={cn("col-span-2 sm:col-span-1", row && "lg:col-span-1")}
        htmlFor={`pr-broken-${key}`}
        hint={madeNum > 0 && brokenNum > 0 ? `Good: ${formatNumber(Math.max(madeNum - brokenNum, 0))}` : "Optional"}
      >
        <Input id={`pr-broken-${key}`} inputMode="numeric" autoComplete="off" placeholder="0" className="num md:h-10" {...register("quantityRejected")} />
      </FormField>

      <div className={cn("col-span-2", row && "lg:col-span-1 lg:pt-[1.625rem]")}>
        <Button type="submit" size="lg" className="w-full md:h-10 lg:w-auto lg:px-6" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Check aria-hidden />}
          {editing ? "Save changes" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function ProductionQuickEntry(props: Props) {
  return (
    <section aria-labelledby="add-production" className="rounded-xl border border-primary/25 bg-card p-4 shadow-xs md:p-5">
      <h2 id="add-production" className="mb-3 font-semibold">
        Add production
      </h2>
      <ProductionFields {...props} layout="row" />
    </section>
  );
}

export function ProductionEditButton({
  entryId,
  initial,
  ...props
}: Props & { entryId: number; initial: Partial<ProductionInput> }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Edit entry">
          <Pencil aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit production</DialogTitle>
          <DialogDescription>Change the date, product or numbers.</DialogDescription>
        </DialogHeader>
        {open && (
          <ProductionFields {...props} entryId={entryId} initial={initial} layout="stacked" onSaved={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
