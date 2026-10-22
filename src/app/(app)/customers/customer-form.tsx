"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerOption } from "@/components/forms/customer-picker";
import { FormField, FormFooter, FormSection, type SheetMode } from "@/components/forms/form-parts";
import { customerSchema, type CustomerInput } from "@/lib/validators";
import { createCustomer, updateCustomer } from "@/server/actions/customers";

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

export function CustomerForm({
  customerId,
  initial,
  defaultState,
  returnTo,
  showMoney = true,
  sheet,
}: {
  customerId?: number;
  initial?: Partial<CustomerInput>;
  defaultState?: string | null;
  returnTo?: string;
  /** Opening balance and private notes are for the owner only. */
  showMoney?: boolean;
  sheet?: SheetMode<CustomerOption>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, handleSubmit, formState, setError } = useForm<CustomerInput, unknown, z.output<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      firmName: "",
      phone: "",
      altPhone: "",
      gstin: "",
      billingAddress: "",
      siteAddress: "",
      stateName: defaultState ?? "",
      openingBalance: "",
      notes: "",
      ...initial,
    },
  });
  const errors = formState.errors;

  const onSubmit = (values: z.output<typeof customerSchema>) =>
    start(async () => {
      const res = customerId ? await updateCustomer(customerId, values) : await createCustomer(values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof CustomerInput, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      if (sheet) {
        const { name, firmName, phone, stateName, siteAddress } = values;
        sheet.onDone({ id: res.data.id, name, firmName: firmName ?? null, phone: phone ?? null, stateName, siteAddress });
        return;
      }
      // Coming from a new order? Go back with this customer already picked.
      router.push(
        returnTo?.startsWith("/orders/new") ? `/orders/new?customer=${res.data.id}` : (returnTo ?? `/customers/${res.data.id}`),
      );
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-3xl space-y-4" noValidate>
      <FormSection title="Customer">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Customer name" error={errors.name?.message} required htmlFor="name">
            <Input id="name" autoComplete="off" placeholder="Person to contact" {...register("name")} />
          </FormField>
          <FormField label="Firm / company" error={errors.firmName?.message} htmlFor="firmName">
            <Input id="firmName" autoComplete="off" placeholder="e.g. Sri Murugan Constructions" {...register("firmName")} />
          </FormField>
          <FormField label="Phone" error={errors.phone?.message} htmlFor="phone">
            <Input id="phone" type="tel" inputMode="tel" autoComplete="off" {...register("phone")} />
          </FormField>
          <FormField label="Alternate phone" error={errors.altPhone?.message} htmlFor="altPhone">
            <Input id="altPhone" type="tel" inputMode="tel" autoComplete="off" {...register("altPhone")} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Billing" description="Used on GST invoices. GSTIN is optional for individuals.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="GSTIN" error={errors.gstin?.message} htmlFor="gstin">
            <Input id="gstin" autoCapitalize="characters" className="uppercase" maxLength={15} {...register("gstin")} />
          </FormField>
          <FormField
            label="State"
            error={errors.stateName?.message}
            hint="Decides CGST + SGST (same state) or IGST (other state)."
            htmlFor="stateName"
          >
            <Input id="stateName" list="states" autoComplete="off" {...register("stateName")} />
            <datalist id="states">
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Billing address" error={errors.billingAddress?.message} htmlFor="billingAddress" className="sm:col-span-2">
            <Textarea id="billingAddress" rows={2} {...register("billingAddress")} />
          </FormField>
          <FormField label="Site / delivery address" error={errors.siteAddress?.message} htmlFor="siteAddress" className="sm:col-span-2">
            <Textarea id="siteAddress" rows={2} {...register("siteAddress")} />
          </FormField>
        </div>
      </FormSection>

      {showMoney && (
      <FormSection title="Account">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Opening balance (₹)"
            error={errors.openingBalance?.message}
            hint="Amount the customer already owed before using this app. Use a minus sign for an advance."
            htmlFor="openingBalance"
          >
            <Input id="openingBalance" inputMode="decimal" placeholder="0" className="num" {...register("openingBalance")} />
          </FormField>
          <FormField label="Notes" error={errors.notes?.message} htmlFor="notes">
            <Textarea id="notes" rows={2} placeholder="Payment habits, preferred delivery time…" {...register("notes")} />
          </FormField>
        </div>
      </FormSection>
      )}

      <FormFooter sheet={!!sheet}>
        <Button type="button" variant="outline" size="lg" onClick={() => (sheet ? sheet.onCancel() : router.back())} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />}
          {customerId ? "Save customer" : "Add customer"}
        </Button>
      </FormFooter>
    </form>
  );
}
