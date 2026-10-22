"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-parts";
import { customerSchema, type CustomerInput } from "@/lib/validators";
import { updateCustomer } from "@/server/actions/customers";
import { INDIAN_STATES } from "./customer-form";

type Output = z.output<typeof customerSchema>;

/** Pencil → pop-up to fix a customer's contact details (no money fields). */
export function EditCustomerButton({ id, initial }: { id: number; initial: CustomerInput }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil aria-hidden /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
        </DialogHeader>
        {open && <EditCustomerForm id={id} initial={initial} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditCustomerForm({ id, initial, onSaved }: { id: number; initial: CustomerInput; onSaved: () => void }) {
  const [pending, start] = useTransition();
  const { register, handleSubmit, formState, setError } = useForm<CustomerInput, unknown, Output>({
    resolver: zodResolver(customerSchema),
    defaultValues: initial,
  });
  const e = formState.errors;
  const k = `ce-${id}`;
  return (
    <form
      noValidate
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2")}
      onSubmit={handleSubmit((values) =>
        start(async () => {
          const res = await updateCustomer(id, values);
          if (!res.ok) {
            for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof CustomerInput, { message: m });
            toast.error(res.error);
            return;
          }
          toast.success(res.message ?? "Saved");
          onSaved();
        }),
      )}
    >
      <FormField label="Customer name" error={e.name?.message} required htmlFor={`${k}-name`}>
        <Input id={`${k}-name`} {...register("name")} />
      </FormField>
      <FormField label="Firm / company" error={e.firmName?.message} htmlFor={`${k}-firm`}>
        <Input id={`${k}-firm`} {...register("firmName")} />
      </FormField>
      <FormField label="Phone" error={e.phone?.message} htmlFor={`${k}-phone`}>
        <Input id={`${k}-phone`} type="tel" inputMode="tel" {...register("phone")} />
      </FormField>
      <FormField label="Alternate phone" error={e.altPhone?.message} htmlFor={`${k}-alt`}>
        <Input id={`${k}-alt`} type="tel" inputMode="tel" {...register("altPhone")} />
      </FormField>
      <FormField label="Site / delivery address" error={e.siteAddress?.message} htmlFor={`${k}-site`} className="sm:col-span-2">
        <Textarea id={`${k}-site`} rows={2} {...register("siteAddress")} />
      </FormField>
      <FormField label="Billing address" error={e.billingAddress?.message} htmlFor={`${k}-bill`} className="sm:col-span-2">
        <Textarea id={`${k}-bill`} rows={2} {...register("billingAddress")} />
      </FormField>
      <FormField label="GSTIN" error={e.gstin?.message} htmlFor={`${k}-gst`}>
        <Input id={`${k}-gst`} className="uppercase" maxLength={15} {...register("gstin")} />
      </FormField>
      <FormField label="State" error={e.stateName?.message} htmlFor={`${k}-state`}>
        <Input id={`${k}-state`} list={`${k}-states`} {...register("stateName")} />
        <datalist id={`${k}-states`}>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </FormField>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />}
          Save
        </Button>
      </div>
    </form>
  );
}
