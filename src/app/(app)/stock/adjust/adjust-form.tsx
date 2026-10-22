"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChoiceCards, FormField, FormFooter, FormSection } from "@/components/forms/form-parts";
import { formatNumber } from "@/lib/format";
import { stockAdjustmentSchema, type StockAdjustmentInput } from "@/lib/validators";
import { createStockAdjustment } from "@/server/actions/stock";

type Item = { id: number; name: string; current: number };

export function AdjustForm({ today, materials, products }: { today: string; materials: Item[]; products: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, control, handleSubmit, formState, setValue, setError } = useForm<
    StockAdjustmentInput,
    unknown,
    z.output<typeof stockAdjustmentSchema>
  >({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: {
      adjDate: today,
      itemType: "product",
      productId: products[0]?.id,
      materialId: undefined,
      direction: "remove",
      quantity: "",
      reason: "",
    },
  });
  const errors = formState.errors;
  const [itemType, productId, materialId, direction, quantity] = useWatch({
    control,
    name: ["itemType", "productId", "materialId", "direction", "quantity"],
  });
  const items = itemType === "material" ? materials : products;
  const selectedId = Number(itemType === "material" ? materialId : productId);
  const selected = items.find((i) => i.id === selectedId);
  const unit = itemType === "material" ? "kg" : "nos";
  const qty = Number(quantity) || 0;
  const after = selected ? selected.current + (direction === "add" ? qty : -qty) : 0;

  const onSubmit = (values: z.output<typeof stockAdjustmentSchema>) =>
    start(async () => {
      const res = await createStockAdjustment(values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof StockAdjustmentInput, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      router.push("/stock");
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-2xl space-y-4" noValidate>
      <FormSection>
        <Controller
          control={control}
          name="itemType"
          render={({ field }) => (
            <ChoiceCards
              name="What to adjust"
              columns={2}
              value={field.value}
              onChange={(v) => {
                field.onChange(v);
                if (v === "material") setValue("materialId", materials[0]?.id);
                else setValue("productId", products[0]?.id);
              }}
              options={[
                { value: "product", label: "Bricks / blocks", sub: "Finished goods (nos)" },
                { value: "material", label: "Raw material", sub: "Fly ash, cement, M sand (kg)" },
              ]}
            />
          )}
        />
        <Controller
          control={control}
          name={itemType === "material" ? "materialId" : "productId"}
          render={({ field }) => (
            <ChoiceCards
              name="Item"
              columns={itemType === "material" ? 3 : 2}
              value={Number(field.value)}
              onChange={field.onChange}
              options={items.map((i) => ({ value: i.id, label: i.name, sub: `Now ${formatNumber(Math.round(i.current))} ${unit}` }))}
            />
          )}
        />
        <Controller
          control={control}
          name="direction"
          render={({ field }) => (
            <ChoiceCards
              name="Direction"
              columns={2}
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "remove", label: "Remove", sub: "Broken, lost or counted less" },
                { value: "add", label: "Add", sub: "Counted more / opening stock" },
              ]}
            />
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={`Quantity (${unit})`} error={errors.quantity?.message} required htmlFor="quantity">
            <Input id="quantity" inputMode="decimal" className="num" {...register("quantity")} />
          </FormField>
          <FormField label="Date" error={errors.adjDate?.message} required htmlFor="adjDate">
            <Input id="adjDate" type="date" max={today} {...register("adjDate")} />
          </FormField>
        </div>
        {selected && qty > 0 && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
            {selected.name}: <span className="num">{formatNumber(Math.round(selected.current))}</span> →{" "}
            <span className="num font-semibold">{formatNumber(Math.round(after))}</span> {unit}
          </p>
        )}
        <FormField label="Reason" error={errors.reason?.message} required htmlFor="reason">
          <Textarea id="reason" rows={2} placeholder="e.g. Physical count on 30 Sep, 450 bricks broken by rain" {...register("reason")} />
        </FormField>
      </FormSection>
      <FormFooter>
        <Button type="button" variant="outline" size="lg" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />}
          Save adjustment
        </Button>
      </FormFooter>
    </form>
  );
}
