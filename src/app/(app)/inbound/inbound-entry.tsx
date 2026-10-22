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
import { SupplierPicker } from "@/components/forms/supplier-picker";
import { materialColor } from "@/lib/colors";
import { formatNumber, formatTonnes } from "@/lib/format";
import { inboundSchema, type InboundData, type InboundInput } from "@/lib/validators";
import { createInbound, updateInbound } from "@/server/actions/inbound";

type Material = { id: number; name: string; code: string };
type Supplier = { id: number; name: string };

type Props = {
  materials: Material[];
  suppliers: Supplier[];
  today: string;
  /** Earliest date allowed (employees can only back-date 2 days). */
  minDate?: string;
};

/**
 * One row: Date · Material · Supplier · Weight · Save.
 * Used at the top of the Inbound page, and inside the edit pop-up.
 */
function InboundFields({
  materials,
  suppliers,
  today,
  minDate,
  initial,
  entryId,
  layout,
  onSaved,
}: Props & {
  initial?: Partial<InboundInput>;
  entryId?: number;
  layout: "row" | "stacked";
  onSaved?: () => void;
}) {
  const [pending, start] = useTransition();
  const editing = entryId !== undefined;

  const { register, control, handleSubmit, formState, setError, resetField, setValue, setFocus } = useForm<
    InboundInput,
    unknown,
    InboundData
  >({
    resolver: zodResolver(inboundSchema),
    defaultValues: {
      entryDate: today,
      materialId: materials[0]?.id,
      supplierId: undefined,
      newSupplierName: "",
      netKg: "",
      ...initial,
    },
  });
  const e = formState.errors;
  const [netKg, supplierId, newSupplierName, materialId, entryDate] = useWatch({
    control,
    name: ["netKg", "supplierId", "newSupplierName", "materialId", "entryDate"],
  });
  const material = materials.find((m) => m.id === Number(materialId));
  const kg = Number(String(netKg ?? "").replace(/,/g, "")) || 0;

  const onSubmit = (values: InboundData) =>
    start(async () => {
      const res = editing ? await updateInbound(entryId, values) : await createInbound(values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof InboundInput, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      if (editing) {
        onSaved?.();
        return;
      }
      // Ready for the next load: keep date, material and supplier; clear the weight.
      resetField("netKg", { defaultValue: "" });
      if (values.newSupplierName) setValue("newSupplierName", values.newSupplierName);
      setFocus("netKg");
    });

  const row = layout === "row";
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className={cn(
        "grid grid-cols-2 gap-3",
        row && "lg:grid-cols-[10.5rem_minmax(0,1fr)_minmax(0,1.3fr)_11rem_auto] lg:items-start",
      )}
    >
      <FormField
        label="Date"
        error={e.entryDate?.message}
        className={cn("col-span-2 sm:col-span-1", row && "lg:col-span-1")}
        htmlFor={`in-date-${entryId ?? "new"}`}
      >
        <Input
          id={`in-date-${entryId ?? "new"}`}
          type="date"
          max={today}
          min={minDate}
          className="md:h-10"
          // Also rendered on the server, so slow phones never see an empty date.
          defaultValue={String(entryDate ?? today)}
          {...register("entryDate")}
        />
      </FormField>

      <FormField
        label="Material"
        error={e.materialId?.message}
        className={cn("col-span-2 sm:col-span-1", row && "lg:col-span-1")}
        htmlFor={`in-mat-${entryId ?? "new"}`}
      >
        <Controller
          control={control}
          name="materialId"
          render={({ field }) => (
            <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(Number(v))}>
              <SelectTrigger id={`in-mat-${entryId ?? "new"}`} className="w-full md:data-[size=default]:h-10">
                <SelectValue placeholder="Choose material">
                  {material && (
                    <>
                      <span className="size-2.5 rounded-full" style={{ background: materialColor(material.code) }} aria-hidden />
                      {material.name}
                    </>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {materials.map((m, i) => (
                  <SelectItem key={m.id} value={String(m.id)} className="py-2.5">
                    <span className="size-2.5 rounded-full" style={{ background: materialColor(m.code, i) }} aria-hidden />
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>

      <FormField
        label="Supplier"
        error={e.newSupplierName?.message ?? e.supplierId?.message}
        className={cn("col-span-2", row && "lg:col-span-1")}
        htmlFor={`in-sup-${entryId ?? "new"}`}
      >
        <SupplierPicker
          id={`in-sup-${entryId ?? "new"}`}
          suppliers={suppliers}
          value={{
            supplierId: supplierId ? Number(supplierId) : undefined,
            newName: (newSupplierName as string) || undefined,
          }}
          onChange={(v) => {
            setValue("supplierId", v.supplierId);
            setValue("newSupplierName", v.newName ?? "");
          }}
        />
      </FormField>

      <FormField
        label="Weight (kg)"
        error={e.netKg?.message}
        hint={kg > 0 ? `= ${formatTonnes(kg)} (${formatNumber(kg)} kg)` : undefined}
        className={cn("col-span-2", row && "lg:col-span-1")}
        htmlFor={`in-kg-${entryId ?? "new"}`}
      >
        <Input
          id={`in-kg-${entryId ?? "new"}`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 25000"
          className="num text-lg font-semibold md:h-10"
          {...register("netKg")}
        />
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

/** The always-visible entry row at the top of the Inbound page. */
export function InboundQuickEntry(props: Props) {
  return (
    <section aria-labelledby="add-load" className="rounded-xl border border-primary/25 bg-card p-4 shadow-xs md:p-5">
      <h2 id="add-load" className="mb-3 font-semibold">
        Add a load
      </h2>
      <InboundFields {...props} layout="row" />
    </section>
  );
}

/** Pencil button that edits an entry in a pop-up, without leaving the page. */
export function InboundEditButton({
  entryId,
  initial,
  ...props
}: Props & { entryId: number; initial: Partial<InboundInput> }) {
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
          <DialogTitle>Edit load</DialogTitle>
          <DialogDescription>Change the date, material, supplier or weight.</DialogDescription>
        </DialogHeader>
        {open && (
          <InboundFields {...props} entryId={entryId} initial={initial} layout="stacked" onSaved={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
