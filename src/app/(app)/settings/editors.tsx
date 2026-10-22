"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { KeyRound, Loader2, Pencil, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ChoiceCards, FormField, FormFooter, FormSection } from "@/components/forms/form-parts";
import { INDIAN_STATES } from "@/app/(app)/customers/customer-form";
import {
  companySchema,
  materialSchema,
  productSchema,
  userCreateSchema,
  userUpdateSchema,
  type CompanyInput,
  type MaterialInput,
  type ProductInput,
  type UserCreateInput,
} from "@/lib/validators";
import {
  createUser,
  resetUserPassword,
  saveMaterial,
  saveProduct,
  saveRecipe,
  updateCompany,
  updateUser,
} from "@/server/actions/settings";
import type { ActionResult } from "@/server/action-utils";

/* Shared dialog shell ---------------------------------------------------- */

function EditorDialog({
  title,
  description,
  trigger,
  children,
}: {
  title: string;
  description?: string;
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {open && children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  );
}

function useSave<T>(close?: () => void) {
  const [pending, start] = useTransition();
  const run = (
    fn: () => Promise<ActionResult<T>>,
    setError?: (field: string, message: string) => void,
  ) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError?.(f, m);
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      close?.();
    });
  return { pending, run };
}

function SaveButton({ pending, label = "Save" }: { pending: boolean; label?: string }) {
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />}
      {label}
    </Button>
  );
}

const EditTrigger = (label: string) => (
  <Button variant="ghost" size="sm" aria-label={label}>
    <Pencil aria-hidden /> Edit
  </Button>
);

/* Company --------------------------------------------------------------- */

export function CompanyForm({ initial }: { initial: CompanyInput }) {
  const { pending, run } = useSave();
  const { register, handleSubmit, formState, setError } = useForm<CompanyInput, unknown, z.output<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: initial,
  });
  const e = formState.errors;
  return (
    <form
      noValidate
      className="mx-auto max-w-3xl space-y-4"
      onSubmit={handleSubmit((v) => run(() => updateCompany(v), (f, m) => setError(f as keyof CompanyInput, { message: m })))}
    >
      <FormSection title="Business" description="Printed on invoices, challans, receipts and statements.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Company name" error={e.name?.message} required htmlFor="c-name">
            <Input id="c-name" {...register("name")} />
          </FormField>
          <FormField label="Tagline" error={e.tagline?.message} htmlFor="c-tag">
            <Input id="c-tag" placeholder="Fly Ash Bricks & Solid Blocks" {...register("tagline")} />
          </FormField>
          <FormField label="Address" error={e.address?.message} htmlFor="c-addr" className="sm:col-span-2">
            <Textarea id="c-addr" rows={2} {...register("address")} />
          </FormField>
          <FormField label="Phone" error={e.phone?.message} htmlFor="c-phone">
            <Input id="c-phone" type="tel" {...register("phone")} />
          </FormField>
          <FormField label="Email" error={e.email?.message} htmlFor="c-email">
            <Input id="c-email" type="email" {...register("email")} />
          </FormField>
        </div>
      </FormSection>
      <FormSection title="GST">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="GSTIN" error={e.gstin?.message} htmlFor="c-gstin">
            <Input id="c-gstin" className="uppercase" maxLength={15} {...register("gstin")} />
          </FormField>
          <FormField label="State" error={e.stateName?.message} htmlFor="c-state">
            <Input id="c-state" list="c-states" {...register("stateName")} />
            <datalist id="c-states">
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </FormField>
          <FormField label="State code" error={e.stateCode?.message} hint="e.g. 33 for Tamil Nadu" htmlFor="c-code">
            <Input id="c-code" inputMode="numeric" maxLength={2} {...register("stateCode")} />
          </FormField>
        </div>
      </FormSection>
      <FormSection title="Payment details" description="Shown on invoices so customers know where to pay.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Bank name" error={e.bankName?.message} htmlFor="c-bank">
            <Input id="c-bank" {...register("bankName")} />
          </FormField>
          <FormField label="Account number" error={e.bankAccount?.message} htmlFor="c-acc">
            <Input id="c-acc" inputMode="numeric" {...register("bankAccount")} />
          </FormField>
          <FormField label="IFSC" error={e.bankIfsc?.message} htmlFor="c-ifsc">
            <Input id="c-ifsc" className="uppercase" {...register("bankIfsc")} />
          </FormField>
          <FormField label="UPI ID" error={e.upiId?.message} htmlFor="c-upi">
            <Input id="c-upi" placeholder="business@bank" {...register("upiId")} />
          </FormField>
        </div>
      </FormSection>
      <FormSection title="Invoices">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
          <FormField label="Payment due in (days)" error={e.defaultDueDays?.message} htmlFor="c-due">
            <Input id="c-due" inputMode="numeric" {...register("defaultDueDays")} />
          </FormField>
          <FormField label="Terms & conditions" error={e.invoiceTerms?.message} htmlFor="c-terms">
            <Textarea id="c-terms" rows={4} {...register("invoiceTerms")} />
          </FormField>
        </div>
      </FormSection>
      <FormFooter>
        <SaveButton pending={pending} label="Save company profile" />
      </FormFooter>
    </form>
  );
}

/* Products -------------------------------------------------------------- */

export function ProductEditor({ id, initial }: { id?: number; initial?: ProductInput }) {
  return (
    <EditorDialog
      title={id ? "Edit product" : "Add product"}
      description="Capacity, default rate and GST used on new invoices."
      trigger={
        id ? (
          EditTrigger("Edit product")
        ) : (
          <Button>
            <Plus aria-hidden /> Add product
          </Button>
        )
      }
    >
      {(close) => <ProductForm id={id} initial={initial} close={close} />}
    </EditorDialog>
  );
}

function ProductForm({ id, initial, close }: { id?: number; initial?: ProductInput; close: () => void }) {
  const { pending, run } = useSave(close);
  const { register, control, handleSubmit, formState, setError } = useForm<ProductInput, unknown, z.output<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: initial ?? { name: "", code: "", size: "", dailyCapacity: "", defaultRate: "", hsnCode: "", gstRate: 0, sortOrder: 10, active: true },
  });
  const e = formState.errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => run(() => saveProduct(id ?? null, v), (f, m) => setError(f as keyof ProductInput, { message: m })))}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Name" error={e.name?.message} required htmlFor="p-name">
          <Input id="p-name" {...register("name")} />
        </FormField>
        <FormField label="Short code" error={e.code?.message} required htmlFor="p-code">
          <Input id="p-code" className="uppercase" {...register("code")} />
        </FormField>
        <FormField label="Size" error={e.size?.message} htmlFor="p-size" className="sm:col-span-2">
          <Input id="p-size" placeholder="230 × 110 × 75 mm" {...register("size")} />
        </FormField>
        <FormField label="Daily capacity (nos)" error={e.dailyCapacity?.message} required htmlFor="p-cap">
          <Input id="p-cap" inputMode="numeric" className="num" {...register("dailyCapacity")} />
        </FormField>
        <FormField label="Default rate (₹/nos)" error={e.defaultRate?.message} required htmlFor="p-rate">
          <Input id="p-rate" inputMode="decimal" className="num" {...register("defaultRate")} />
        </FormField>
        <FormField label="HSN code" error={e.hsnCode?.message} htmlFor="p-hsn">
          <Input id="p-hsn" inputMode="numeric" {...register("hsnCode")} />
        </FormField>
        <FormField label="GST %" error={e.gstRate?.message} hint="0 for a plain bill" htmlFor="p-gst">
          <Input id="p-gst" inputMode="decimal" className="num" {...register("gstRate")} />
        </FormField>
        <FormField label="Display order" error={e.sortOrder?.message} htmlFor="p-order">
          <Input id="p-order" inputMode="numeric" {...register("sortOrder")} />
        </FormField>
        <div className="flex items-center gap-3 pt-6">
          <Controller control={control} name="active" render={({ field }) => <Switch id="p-active" checked={field.value} onCheckedChange={field.onChange} />} />
          <label htmlFor="p-active" className="text-sm">
            Active
          </label>
        </div>
      </div>
      <div className="flex justify-end">
        <SaveButton pending={pending} />
      </div>
    </form>
  );
}

/** Kg of each raw material per brick — drives raw-material stock estimates. */
export function RecipeEditor({
  productId,
  productName,
  materials,
  initial,
}: {
  productId: number;
  productName: string;
  materials: { id: number; name: string }[];
  initial: Record<number, number>;
}) {
  const [values, setValues] = useState<Record<number, string>>(
    Object.fromEntries(materials.map((m) => [m.id, initial[m.id] ? String(initial[m.id]) : ""])),
  );
  const { pending, run } = useSave();
  const total = materials.reduce((a, m) => a + (Number(values[m.id]) || 0), 0);
  return (
    <form
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        run(() =>
          saveRecipe({ productId, lines: materials.map((m) => ({ materialId: m.id, kgPerUnit: values[m.id] || 0 })) }),
        );
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-3 gap-2">
        {materials.map((m) => (
          <FormField key={m.id} label={`${m.name} (kg)`} htmlFor={`r-${productId}-${m.id}`}>
            <Input
              id={`r-${productId}-${m.id}`}
              inputMode="decimal"
              className="num"
              value={values[m.id]}
              onChange={(ev) => setValues((v) => ({ ...v, [m.id]: ev.target.value }))}
              aria-label={`${m.name} kg per ${productName}`}
            />
          </FormField>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="num text-xs text-muted-foreground">≈ {total.toFixed(2)} kg of material per piece</p>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />} Save mix
        </Button>
      </div>
    </form>
  );
}

/* Materials ------------------------------------------------------------- */

export function MaterialEditor({ id, initial }: { id?: number; initial?: MaterialInput }) {
  return (
    <EditorDialog
      title={id ? "Edit material" : "Add material"}
      trigger={
        id ? (
          EditTrigger("Edit material")
        ) : (
          <Button variant="outline">
            <Plus aria-hidden /> Add material
          </Button>
        )
      }
    >
      {(close) => <MaterialForm id={id} initial={initial} close={close} />}
    </EditorDialog>
  );
}

function MaterialForm({ id, initial, close }: { id?: number; initial?: MaterialInput; close: () => void }) {
  const { pending, run } = useSave(close);
  const { register, control, handleSubmit, formState, setError } = useForm<MaterialInput, unknown, z.output<typeof materialSchema>>({
    resolver: zodResolver(materialSchema),
    defaultValues: initial ?? { name: "", code: "", lowStockKg: "", sortOrder: 10, active: true },
  });
  const e = formState.errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => run(() => saveMaterial(id ?? null, v), (f, m) => setError(f as keyof MaterialInput, { message: m })))}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Name" error={e.name?.message} required htmlFor="m-name">
          <Input id="m-name" {...register("name")} />
        </FormField>
        <FormField label="Short code" error={e.code?.message} required htmlFor="m-code">
          <Input id="m-code" className="uppercase" {...register("code")} />
        </FormField>
        <FormField label="Reorder level (kg)" error={e.lowStockKg?.message} hint="Warn on the dashboard below this" htmlFor="m-low">
          <Input id="m-low" inputMode="decimal" className="num" {...register("lowStockKg")} />
        </FormField>
        <FormField label="Display order" error={e.sortOrder?.message} htmlFor="m-order">
          <Input id="m-order" inputMode="numeric" {...register("sortOrder")} />
        </FormField>
        <div className="flex items-center gap-3">
          <Controller control={control} name="active" render={({ field }) => <Switch id="m-active" checked={field.value} onCheckedChange={field.onChange} />} />
          <label htmlFor="m-active" className="text-sm">
            Active
          </label>
        </div>
      </div>
      <div className="flex justify-end">
        <SaveButton pending={pending} />
      </div>
    </form>
  );
}

/* Users ----------------------------------------------------------------- */

export function NewUserButton() {
  return (
    <EditorDialog
      title="Add login"
      description="Employees can only enter inbound, production and dispatch. Owners see everything."
      trigger={
        <Button>
          <Plus aria-hidden /> Add login
        </Button>
      }
    >
      {(close) => <NewUserForm close={close} />}
    </EditorDialog>
  );
}

function NewUserForm({ close }: { close: () => void }) {
  const { pending, run } = useSave(close);
  const { register, control, handleSubmit, formState, setError } = useForm<UserCreateInput, unknown, z.output<typeof userCreateSchema>>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { name: "", username: "", phone: "", role: "employee", password: "" },
  });
  const e = formState.errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => run(() => createUser(v), (f, m) => setError(f as keyof UserCreateInput, { message: m })))}
    >
      <Controller
        control={control}
        name="role"
        render={({ field }) => (
          <ChoiceCards
            name="Role"
            columns={2}
            value={field.value}
            onChange={field.onChange}
            options={[
              { value: "employee", label: "Employee", sub: "Data entry only" },
              { value: "owner", label: "Owner", sub: "Full access incl. money" },
            ]}
          />
        )}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Full name" error={e.name?.message} required htmlFor="u-name">
          <Input id="u-name" {...register("name")} />
        </FormField>
        <FormField label="Phone" error={e.phone?.message} htmlFor="u-phone">
          <Input id="u-phone" type="tel" {...register("phone")} />
        </FormField>
        <FormField label="Username" error={e.username?.message} required htmlFor="u-user">
          <Input id="u-user" autoCapitalize="none" autoComplete="off" {...register("username")} />
        </FormField>
        <FormField label="Password" error={e.password?.message} required hint="At least 8 characters" htmlFor="u-pass">
          <Input id="u-pass" type="password" autoComplete="new-password" {...register("password")} />
        </FormField>
      </div>
      <div className="flex justify-end">
        <SaveButton pending={pending} label="Create login" />
      </div>
    </form>
  );
}

export function UserEditor({
  id,
  initial,
}: {
  id: number;
  initial: { name: string; phone: string; role: "owner" | "employee"; active: boolean };
}) {
  return (
    <EditorDialog title="Edit login" trigger={EditTrigger("Edit login")}>
      {(close) => <UserForm id={id} initial={initial} close={close} />}
    </EditorDialog>
  );
}

function UserForm({
  id,
  initial,
  close,
}: {
  id: number;
  initial: z.input<typeof userUpdateSchema>;
  close: () => void;
}) {
  const { pending, run } = useSave(close);
  const { register, control, handleSubmit, formState, setError } = useForm<
    z.input<typeof userUpdateSchema>,
    unknown,
    z.output<typeof userUpdateSchema>
  >({ resolver: zodResolver(userUpdateSchema), defaultValues: initial });
  const e = formState.errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => run(() => updateUser(id, v), (f, m) => setError(f as "name", { message: m })))}
    >
      <Controller
        control={control}
        name="role"
        render={({ field }) => (
          <ChoiceCards
            name="Role"
            columns={2}
            value={field.value}
            onChange={field.onChange}
            options={[
              { value: "employee", label: "Employee", sub: "Data entry only" },
              { value: "owner", label: "Owner", sub: "Full access" },
            ]}
          />
        )}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Full name" error={e.name?.message} required htmlFor="ue-name">
          <Input id="ue-name" {...register("name")} />
        </FormField>
        <FormField label="Phone" error={e.phone?.message} htmlFor="ue-phone">
          <Input id="ue-phone" type="tel" {...register("phone")} />
        </FormField>
      </div>
      <div className="flex items-center gap-3">
        <Controller control={control} name="active" render={({ field }) => <Switch id="ue-active" checked={field.value} onCheckedChange={field.onChange} />} />
        <label htmlFor="ue-active" className="text-sm">
          Can sign in
        </label>
      </div>
      <div className="flex justify-end">
        <SaveButton pending={pending} />
      </div>
    </form>
  );
}

export function ResetPasswordButton({ id, name }: { id: number; name: string }) {
  return (
    <EditorDialog
      title={`New password for ${name}`}
      description="They'll be signed out and must use the new password."
      trigger={
        <Button variant="ghost" size="sm">
          <KeyRound aria-hidden /> Password
        </Button>
      }
    >
      {(close) => <ResetForm id={id} close={close} />}
    </EditorDialog>
  );
}

function ResetForm({ id, close }: { id: number; close: () => void }) {
  const [pw, setPw] = useState("");
  const { pending, run } = useSave(close);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        run(() => resetUserPassword(id, pw));
      }}
    >
      <FormField label="New password" hint="At least 8 characters" htmlFor="rp">
        <Input id="rp" type="text" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} />
      </FormField>
      <div className="flex justify-end">
        <SaveButton pending={pending} label="Set password" />
      </div>
    </form>
  );
}
