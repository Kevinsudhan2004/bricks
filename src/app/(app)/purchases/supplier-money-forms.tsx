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
import { ChoiceCards, FormField, FormFooter, FormSection, type SheetMode } from "@/components/forms/form-parts";
import { InvoiceChooser } from "@/components/forms/invoice-chooser";
import { SupplierPicker } from "@/components/forms/supplier-picker";
import { amountInWords, formatINR } from "@/lib/format";
import {
  SUPPLIER_NOTE_REASONS,
  supplierNoteSchema,
  supplierPaymentSchema,
  type SupplierNoteInput,
  type SupplierPaymentInput,
} from "@/lib/validators";
import { createSupplierNote, createSupplierPayment } from "@/server/actions/purchases";
import type { BillBalanceOption } from "@/server/queries/purchases";

type Supplier = { id: number; name: string };

const MODES = [
  { value: "bank" as const, label: "Bank / NEFT" },
  { value: "upi" as const, label: "UPI" },
  { value: "cash" as const, label: "Cash" },
  { value: "cheque" as const, label: "Cheque" },
];

/* ------------------------------------------------------------------ */
/* Pay a supplier                                                      */
/* ------------------------------------------------------------------ */

type PaymentOutput = z.output<typeof supplierPaymentSchema>;

export function SupplierPaymentForm({
  suppliers,
  balances,
  today,
  initial,
  sheet,
}: {
  suppliers: Supplier[];
  balances: Record<number, BillBalanceOption[]>;
  today: string;
  initial?: Partial<SupplierPaymentInput>;
  sheet?: SheetMode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, control, handleSubmit, formState, setError, setValue } = useForm<SupplierPaymentInput, unknown, PaymentOutput>({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: {
      paymentDate: today,
      supplierId: undefined,
      billId: undefined,
      amount: "",
      mode: "bank",
      reference: "",
      remarks: "",
      ...initial,
    },
  });
  const errors = formState.errors;
  const [supplierId, billId, amount, mode] = useWatch({ control, name: ["supplierId", "billId", "amount", "mode"] });
  const bills = supplierId ? (balances[Number(supplierId)] ?? []) : [];
  const selected = bills.find((b) => b.id === Number(billId));
  const amt = Number(String(amount ?? "").replace(/,/g, "")) || 0;
  const totalDue = bills.reduce((a, b) => a + Math.max(b.balance, 0), 0);

  const onSubmit = (values: PaymentOutput) =>
    start(async () => {
      const res = await createSupplierPayment(values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof SupplierPaymentInput, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      if (sheet) sheet.onDone(res.data.id);
      else router.push(`/suppliers/${values.supplierId}`);
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-3xl space-y-4" noValidate>
      <FormSection title="To">
        <FormField label="Supplier" error={errors.supplierId?.message} required htmlFor="pay-supplier">
          <Controller
            control={control}
            name="supplierId"
            render={({ field }) => (
              <SupplierPicker
                id="pay-supplier"
                suppliers={suppliers}
                allowNew={false}
                invalid={!!errors.supplierId}
                value={{ supplierId: field.value ? Number(field.value) : undefined }}
                onChange={(v) => {
                  if (!v.supplierId) return;
                  field.onChange(v.supplierId);
                  setValue("billId", (balances[v.supplierId] ?? []).find((b) => b.balance > 0)?.id);
                }}
              />
            )}
          />
        </FormField>
        {!!supplierId && (
          <div className="space-y-2">
            <p className="text-[13px] font-medium">
              Against bill <span className="font-normal text-muted-foreground">· total to pay {formatINR(totalDue, { decimals: false })}</span>
            </p>
            <Controller
              control={control}
              name="billId"
              render={({ field }) => (
                <InvoiceChooser
                  label="Bill"
                  invoices={bills}
                  value={field.value ? Number(field.value) : undefined}
                  onChange={(v) => field.onChange(v)}
                  noneLabel="Advance / on account"
                  noneHint="Not for one specific bill"
                />
              )}
            />
          </div>
        )}
      </FormSection>

      <FormSection title="Payment">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Amount paid (₹)" error={errors.amount?.message} required htmlFor="pay-amount">
            <Input id="pay-amount" inputMode="decimal" placeholder="0" className="num h-14 text-2xl font-semibold md:h-12 md:text-xl" {...register("amount")} />
          </FormField>
          <FormField label="Date" error={errors.paymentDate?.message} required htmlFor="pay-date">
            <Input id="pay-date" type="date" max={today} {...register("paymentDate")} />
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
            More than the {formatINR(selected.balance)} owed on this bill: debit and credit won&apos;t match, so it can&apos;t be closed.
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
            htmlFor="pay-reference"
          >
            <Input id="pay-reference" autoComplete="off" {...register("reference")} />
          </FormField>
          <FormField label="Remarks" error={errors.remarks?.message} htmlFor="pay-remarks">
            <Textarea id="pay-remarks" rows={1} {...register("remarks")} />
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

/* ------------------------------------------------------------------ */
/* Supplier credit / debit note                                        */
/* ------------------------------------------------------------------ */

type NoteOutput = z.output<typeof supplierNoteSchema>;

const CREDIT_REASONS = ["short_weight", "quality", "rate_difference", "discount", "return", "other"] as const;
const DEBIT_REASONS = ["transport", "rate_difference", "other"] as const;

export function SupplierNoteForm({
  suppliers,
  balances,
  today,
  initial,
  sheet,
}: {
  suppliers: Supplier[];
  balances: Record<number, BillBalanceOption[]>;
  today: string;
  initial?: Partial<SupplierNoteInput>;
  sheet?: SheetMode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, control, handleSubmit, formState, setError, setValue } = useForm<SupplierNoteInput, unknown, NoteOutput>({
    resolver: zodResolver(supplierNoteSchema),
    defaultValues: {
      type: "credit",
      noteDate: today,
      supplierId: undefined,
      billId: undefined,
      amount: "",
      reason: "short_weight",
      description: "",
      ...initial,
    },
  });
  const errors = formState.errors;
  const [type, supplierId] = useWatch({ control, name: ["type", "supplierId"] });
  const bills = supplierId ? (balances[Number(supplierId)] ?? []) : [];
  const reasons = type === "debit" ? DEBIT_REASONS : CREDIT_REASONS;

  const onSubmit = (values: NoteOutput) =>
    start(async () => {
      const res = await createSupplierNote(values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof SupplierNoteInput, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      if (sheet) sheet.onDone(res.data.id);
      else router.push(`/suppliers/${values.supplierId}`);
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
                setValue("reason", v === "debit" ? "transport" : "short_weight");
              }}
              options={[
                { value: "credit", label: "Credit from supplier", sub: "Reduces what you owe them", color: "var(--success)" },
                { value: "debit", label: "Extra charge", sub: "Adds to what you owe them", color: "var(--warning)" },
              ]}
            />
          )}
        />
        <FormField label="Supplier" error={errors.supplierId?.message} required htmlFor="note-supplier">
          <Controller
            control={control}
            name="supplierId"
            render={({ field }) => (
              <SupplierPicker
                id="note-supplier"
                suppliers={suppliers}
                allowNew={false}
                invalid={!!errors.supplierId}
                value={{ supplierId: field.value ? Number(field.value) : undefined }}
                onChange={(v) => {
                  if (!v.supplierId) return;
                  field.onChange(v.supplierId);
                  setValue("billId", undefined);
                }}
              />
            )}
          />
        </FormField>
        {!!supplierId && (
          <div className="space-y-2">
            <p className="text-[13px] font-medium">Bill</p>
            <Controller
              control={control}
              name="billId"
              render={({ field }) => (
                <InvoiceChooser
                  label="Bill"
                  invoices={bills}
                  onlyDue={false}
                  value={field.value ? Number(field.value) : undefined}
                  onChange={(v) => field.onChange(v)}
                  noneLabel="General (no bill)"
                  noneHint="Applies to the supplier's account"
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
                columns={3}
                value={field.value}
                onChange={field.onChange}
                options={reasons.map((r) => ({ value: r, label: SUPPLIER_NOTE_REASONS[r] }))}
              />
            )}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Amount (₹)" error={errors.amount?.message} required htmlFor="note-amount">
            <Input id="note-amount" inputMode="decimal" placeholder="0" className="num h-12 text-xl font-semibold" {...register("amount")} />
          </FormField>
          <FormField label="Date" error={errors.noteDate?.message} required htmlFor="note-date">
            <Input id="note-date" type="date" max={today} {...register("noteDate")} />
          </FormField>
        </div>
        <FormField label="Description" error={errors.description?.message} htmlFor="note-description">
          <Textarea id="note-description" rows={2} placeholder="e.g. Load on 12 Oct was 420 kg short" {...register("description")} />
        </FormField>
      </FormSection>

      <FormFooter sheet={!!sheet}>
        <Button type="button" variant="outline" size="lg" onClick={() => (sheet ? sheet.onCancel() : router.back())} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />}
          Save {type === "debit" ? "extra charge" : "credit"}
        </Button>
      </FormFooter>
    </form>
  );
}
