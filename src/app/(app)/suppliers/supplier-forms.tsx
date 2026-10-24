"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Loader2, Pencil, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-parts";
import { supplierSchema, type SupplierInput } from "@/lib/validators";
import { saveSupplier } from "@/server/actions/suppliers";

type Output = z.output<typeof supplierSchema>;
const EMPTY: SupplierInput = { name: "", phone: "", gstin: "", address: "", openingBalance: "", active: true };

function SupplierFields({
  id,
  initial,
  isOwner,
  compact,
  onSaved,
}: {
  id?: number;
  initial?: SupplierInput;
  isOwner: boolean;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const [pending, start] = useTransition();
  const { register, control, handleSubmit, formState, setError, reset, setFocus } = useForm<SupplierInput, unknown, Output>({
    resolver: zodResolver(supplierSchema),
    defaultValues: initial ?? EMPTY,
  });
  const e = formState.errors;
  const key = id ?? "new";

  const onSubmit = (values: Output) =>
    start(async () => {
      const res = await saveSupplier(id ?? null, values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof SupplierInput, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      if (id) onSaved?.();
      else {
        reset(EMPTY);
        setFocus("name");
      }
    });

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className={cn("grid grid-cols-1 gap-3", compact && "sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-start")}
    >
      <FormField label="Supplier name" error={e.name?.message} required htmlFor={`s-name-${key}`}>
        <Input id={`s-name-${key}`} autoComplete="off" placeholder="e.g. Kaveri M-Sand Quarry" className="md:h-10" {...register("name")} />
      </FormField>
      <FormField label="Phone" error={e.phone?.message} htmlFor={`s-phone-${key}`}>
        <Input id={`s-phone-${key}`} type="tel" inputMode="tel" autoComplete="off" className="md:h-10" {...register("phone")} />
      </FormField>
      {compact ? (
        <FormField label="Place / address" error={e.address?.message} htmlFor={`s-addr-${key}`} className="sm:col-span-2 lg:col-span-1">
          <Input id={`s-addr-${key}`} autoComplete="off" className="md:h-10" {...register("address")} />
        </FormField>
      ) : (
        <>
          <FormField label="Address" error={e.address?.message} htmlFor={`s-addr-${key}`}>
            <Textarea id={`s-addr-${key}`} rows={2} {...register("address")} />
          </FormField>
          <FormField label="GSTIN (optional)" error={e.gstin?.message} htmlFor={`s-gst-${key}`}>
            <Input id={`s-gst-${key}`} className="uppercase" maxLength={15} {...register("gstin")} />
          </FormField>
          {isOwner && (
            <FormField
              label="Opening balance (₹)"
              error={e.openingBalance?.message}
              hint="What you already owed them before using this app. Use a minus sign for an advance you paid."
              htmlFor={`s-open-${key}`}
            >
              <Input id={`s-open-${key}`} inputMode="decimal" placeholder="0" className="num" {...register("openingBalance")} />
            </FormField>
          )}
          {isOwner && (
            <div className="flex items-center gap-3">
              <Controller
                control={control}
                name="active"
                render={({ field }) => <Switch id={`s-active-${key}`} checked={field.value} onCheckedChange={field.onChange} />}
              />
              <label htmlFor={`s-active-${key}`} className="text-sm">
                Show in the supplier list
              </label>
            </div>
          )}
        </>
      )}
      <div className={cn(compact && "sm:col-span-2 lg:col-span-1 lg:pt-[1.625rem]")}>
        <Button type="submit" size="lg" className="w-full md:h-10 lg:w-auto" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : id ? <Save aria-hidden /> : <Plus aria-hidden />}
          {id ? "Save" : "Add supplier"}
        </Button>
      </div>
    </form>
  );
}

export function AddSupplierRow({ isOwner }: { isOwner: boolean }) {
  return (
    <section aria-labelledby="add-supplier" className="rounded-xl border border-primary/25 bg-card p-4 shadow-xs md:p-5">
      <h2 id="add-supplier" className="mb-3 font-semibold">
        Add a supplier
      </h2>
      <SupplierFields isOwner={isOwner} compact />
    </section>
  );
}

export function EditSupplierButton({ id, initial, isOwner }: { id: number; initial: SupplierInput; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${initial.name}`}>
          <Pencil aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit supplier</DialogTitle>
        </DialogHeader>
        {open && <SupplierFields id={id} initial={initial} isOwner={isOwner} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
