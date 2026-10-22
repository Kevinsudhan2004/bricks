"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CustomerPicker, type CustomerOption } from "@/components/forms/customer-picker";
import { ChoiceCards, FormField, FormFooter, FormSection, type SheetMode } from "@/components/forms/form-parts";
import { InvoiceChooser } from "@/components/forms/invoice-chooser";
import { amountInWords, formatINR } from "@/lib/format";
import { paymentSchema, type PaymentInput } from "@/lib/validators";
import { createPayment } from "@/server/actions/money";
import type { InvoiceBalanceOption } from "@/server/queries/money";

type Output = z.output<typeof paymentSchema>;

const MODES = [
  { value: "upi" as const, label: "UPI" },
  { value: "bank" as const, label: "Bank / NEFT" },
  { value: "cash" as const, label: "Cash" },
  { value: "cheque" as const, label: "Cheque" },
];

export function PaymentForm({
  customers,
  balances,
  today,
  initial,
  returnTo,
  sheet,
}: {
  customers: CustomerOption[];
  balances: Record<number, InvoiceBalanceOption[]>;
  today: string;
  initial?: Partial<PaymentInput>;
  returnTo?: string;
  sheet?: SheetMode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, control, handleSubmit, formState, setError, setValue } = useForm<PaymentInput, unknown, Output>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      paymentDate: today,
      customerId: undefined,
      invoiceId: undefined,
      amount: "",
      mode: "upi",
      reference: "",
      remarks: "",
      ...initial,
    },
  });
  const errors = formState.errors;
  const [customerId, invoiceId, amount, mode] = useWatch({ control, name: ["customerId", "invoiceId", "amount", "mode"] });
  const invoices = customerId ? (balances[Number(customerId)] ?? []) : [];
  const selected = invoices.find((i) => i.id === Number(invoiceId));
  const amt = Number(String(amount ?? "").replace(/,/g, "")) || 0;
  const totalDue = invoices.reduce((a, i) => a + Math.max(i.balance, 0), 0);

  const onSubmit = (values: Output) =>
    start(async () => {
      const res = await createPayment(values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof PaymentInput, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved", {
        action: { label: "Print receipt", onClick: () => window.open(`/print/receipt/${res.data.id}`, "_blank") },
      });
      if (sheet) sheet.onDone(res.data.id);
      else router.push(returnTo ?? `/customers/${values.customerId}`);
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-3xl space-y-4" noValidate>
      <FormSection title="From">
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
                  const firstDue = (balances[c.id] ?? []).find((i) => i.balance > 0);
                  setValue("invoiceId", firstDue?.id);
                }}
              />
            )}
          />
        </FormField>
        {!!customerId && (
          <div className="space-y-2">
            <p className="text-[13px] font-medium">
              Against order{" "}
              <span className="font-normal text-muted-foreground">· total due {formatINR(totalDue, { decimals: false })}</span>
            </p>
            <Controller
              control={control}
              name="invoiceId"
              render={({ field }) => (
                <InvoiceChooser
                  invoices={invoices}
                  value={field.value ? Number(field.value) : undefined}
                  onChange={(v) => field.onChange(v)}
                  noneLabel="Advance / on account"
                  noneHint="Not for one specific order"
                />
              )}
            />
          </div>
        )}
      </FormSection>

      <FormSection title="Payment">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Amount received (₹)" error={errors.amount?.message} required htmlFor="amount">
            <Input id="amount" inputMode="decimal" placeholder="0" className="num h-14 text-2xl font-semibold md:h-12 md:text-xl" {...register("amount")} />
          </FormField>
          <FormField label="Date" error={errors.paymentDate?.message} required htmlFor="paymentDate">
            <Input id="paymentDate" type="date" max={today} {...register("paymentDate")} />
          </FormField>
        </div>
        {selected && selected.balance > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setValue("amount", String(selected.balance))}>
              Full balance {formatINR(selected.balance)}
            </Button>
            {[0.5, 0.25].map((f) => (
              <Button key={f} type="button" variant="outline" size="sm" onClick={() => setValue("amount", String(Math.round(selected.balance * f)))}>
                {f * 100}%
              </Button>
            ))}
          </div>
        )}
        {amt > 0 && <p className="text-xs text-muted-foreground">{amountInWords(amt)}</p>}
        {selected && amt > selected.balance && selected.balance > 0 && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground dark:text-warning">
            <AlertTriangle className="size-3.5" aria-hidden />
            More than the {formatINR(selected.balance)} due on this order — the extra will show as excess received.
          </p>
        )}
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">Mode</p>
          <Controller
            control={control}
            name="mode"
            render={({ field }) => <ChoiceCards name="Payment mode" columns={4} value={field.value} onChange={field.onChange} options={MODES} />}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label={mode === "cheque" ? "Cheque number" : mode === "cash" ? "Reference (optional)" : "UTR / transaction ID"}
            error={errors.reference?.message}
            htmlFor="reference"
          >
            <Input id="reference" autoComplete="off" {...register("reference")} />
          </FormField>
          <FormField label="Remarks" error={errors.remarks?.message} htmlFor="remarks">
            <Textarea id="remarks" rows={1} {...register("remarks")} />
          </FormField>
        </div>
      </FormSection>

      <FormFooter sheet={!!sheet}>
        <Button type="button" variant="outline" size="lg" onClick={() => (sheet ? sheet.onCancel() : router.back())} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />}
          Save payment
        </Button>
      </FormFooter>
    </form>
  );
}
