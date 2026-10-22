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
import { CustomerPicker, type CustomerOption } from "@/components/forms/customer-picker";
import { ChoiceCards, FormField, FormFooter, FormSection, type SheetMode } from "@/components/forms/form-parts";
import { InvoiceChooser } from "@/components/forms/invoice-chooser";
import { NOTE_REASONS, noteSchema, type NoteInput } from "@/lib/validators";
import { createNote } from "@/server/actions/money";
import type { InvoiceBalanceOption } from "@/server/queries/money";

type Output = z.output<typeof noteSchema>;

const CREDIT_REASONS = ["damaged", "return", "rate_difference", "discount", "shortage", "other"] as const;
const DEBIT_REASONS = ["transport", "rate_difference", "other"] as const;

export function NoteForm({
  customers,
  balances,
  today,
  initial,
  sheet,
}: {
  customers: CustomerOption[];
  balances: Record<number, InvoiceBalanceOption[]>;
  today: string;
  initial?: Partial<NoteInput>;
  sheet?: SheetMode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, control, handleSubmit, formState, setError, setValue } = useForm<NoteInput, unknown, Output>({
    resolver: zodResolver(noteSchema),
    defaultValues: {
      type: "credit",
      noteDate: today,
      customerId: undefined,
      invoiceId: undefined,
      amount: "",
      reason: "damaged",
      description: "",
      ...initial,
    },
  });
  const errors = formState.errors;
  const [type, customerId] = useWatch({ control, name: ["type", "customerId"] });
  const invoices = customerId ? (balances[Number(customerId)] ?? []) : [];
  const reasons = type === "debit" ? DEBIT_REASONS : CREDIT_REASONS;

  const onSubmit = (values: Output) =>
    start(async () => {
      const res = await createNote(values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof NoteInput, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      if (sheet) sheet.onDone(res.data.id);
      else router.push(`/customers/${values.customerId}`);
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-3xl space-y-4" noValidate>
      <FormSection>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <ChoiceCards
              name="Note type"
              columns={2}
              value={field.value}
              onChange={(v) => {
                field.onChange(v);
                setValue("reason", v === "debit" ? "transport" : "damaged");
              }}
              options={[
                { value: "credit", label: "Credit note", sub: "Reduce what the customer owes", color: "var(--success)" },
                { value: "debit", label: "Debit note", sub: "Add to what the customer owes", color: "var(--warning)" },
              ]}
            />
          )}
        />
        <FormField label="Customer" error={errors.customerId?.message} required htmlFor="customer">
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <CustomerPicker
                id="customer"
                customers={customers}
                value={field.value ? Number(field.value) : undefined}
                invalid={!!errors.customerId}
                onChange={(c) => {
                  field.onChange(c.id);
                  setValue("invoiceId", undefined);
                }}
              />
            )}
          />
        </FormField>
        {!!customerId && (
          <div className="space-y-2">
            <p className="text-[13px] font-medium">Order</p>
            <Controller
              control={control}
              name="invoiceId"
              render={({ field }) => (
                <InvoiceChooser
                  invoices={invoices}
                  onlyDue={false}
                  value={field.value ? Number(field.value) : undefined}
                  onChange={(v) => field.onChange(v)}
                  noneLabel="General (no order)"
                  noneHint="Applies to the customer's account"
                />
              )}
            />
          </div>
        )}
      </FormSection>

      <FormSection title="Details">
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">Reason</p>
          <Controller
            control={control}
            name="reason"
            render={({ field }) => (
              <ChoiceCards
                name="Reason"
                columns={type === "debit" ? 3 : 3}
                value={field.value}
                onChange={field.onChange}
                options={reasons.map((r) => ({ value: r, label: NOTE_REASONS[r] }))}
              />
            )}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Amount (₹)" error={errors.amount?.message} required htmlFor="amount">
            <Input id="amount" inputMode="decimal" placeholder="0" className="num h-12 text-xl font-semibold" {...register("amount")} />
          </FormField>
          <FormField label="Date" error={errors.noteDate?.message} required htmlFor="noteDate">
            <Input id="noteDate" type="date" max={today} {...register("noteDate")} />
          </FormField>
        </div>
        <FormField label="Description" error={errors.description?.message} htmlFor="description">
          <Textarea id="description" rows={2} placeholder="e.g. 400 bricks broken while unloading at site" {...register("description")} />
        </FormField>
      </FormSection>

      <FormFooter sheet={!!sheet}>
        <Button type="button" variant="outline" size="lg" onClick={() => (sheet ? sheet.onCancel() : router.back())} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />}
          Save {type === "debit" ? "debit" : "credit"} note
        </Button>
      </FormFooter>
    </form>
  );
}
