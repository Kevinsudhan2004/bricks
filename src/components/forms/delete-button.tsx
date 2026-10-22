"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/server/action-utils";

/** Delete with a required reason (kept in the audit log). */
export function DeleteButton({
  id,
  action,
  title = "Delete this entry?",
  description = "The entry will be removed from all totals. The reason is kept in the audit log.",
  confirmLabel = "Delete",
  redirectTo,
  variant = "icon",
}: {
  id: number;
  action: (input: { id: number; reason: string }) => Promise<ActionResult<unknown>>;
  title?: string;
  description?: string;
  confirmLabel?: string;
  redirectTo?: string;
  variant?: "icon" | "button";
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    if (!reason.trim()) {
      setError("Please write a short reason.");
      return;
    }
    start(async () => {
      const res = await action({ id, reason: reason.trim() });
      if (res.ok) {
        toast.success(res.message ?? "Deleted");
        setOpen(false);
        setReason("");
        if (redirectTo) router.push(redirectTo);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon-sm" aria-label={confirmLabel} className="text-muted-foreground hover:text-destructive">
            <Trash2 aria-hidden />
          </Button>
        ) : (
          <Button variant="destructive">
            <Trash2 aria-hidden />
            {confirmLabel}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`reason-${id}`}>Reason</Label>
          <Textarea
            id={`reason-${id}`}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(undefined);
            }}
            placeholder="e.g. Entered twice by mistake"
            rows={2}
          />
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
