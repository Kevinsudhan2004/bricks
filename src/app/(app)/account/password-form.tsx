"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormSection } from "@/components/forms/form-parts";
import { changePasswordSchema } from "@/lib/validators";
import { changeOwnPassword } from "@/server/actions/settings";

type In = z.input<typeof changePasswordSchema>;

export function PasswordForm() {
  const [pending, start] = useTransition();
  const { register, handleSubmit, formState, setError, reset } = useForm<In, unknown, z.output<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: "", next: "", confirm: "" },
  });
  const e = formState.errors;
  return (
    <form
      noValidate
      onSubmit={handleSubmit((v) =>
        start(async () => {
          const res = await changeOwnPassword(v);
          if (!res.ok) {
            for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof In, { message: m });
            toast.error(res.error);
            return;
          }
          toast.success(res.message ?? "Saved");
          reset();
        }),
      )}
    >
      <FormSection>
        <FormField label="Current password" error={e.current?.message} htmlFor="pw-current">
          <Input id="pw-current" type="password" autoComplete="current-password" {...register("current")} />
        </FormField>
        <FormField label="New password" error={e.next?.message} htmlFor="pw-next">
          <Input id="pw-next" type="password" autoComplete="new-password" {...register("next")} />
        </FormField>
        <FormField label="Type it again" error={e.confirm?.message} htmlFor="pw-confirm">
          <Input id="pw-confirm" type="password" autoComplete="new-password" {...register("confirm")} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />}
          Change password
        </Button>
      </FormSection>
    </form>
  );
}
