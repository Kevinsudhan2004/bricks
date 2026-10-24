"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
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

/**
 * Close one order / supplier bill (or every ready one at once). The server re-checks that
 * debit and credit match, so a stale screen can never close something that still has a balance.
 */
export function CloseButton({
  ids,
  action,
  label,
  title,
  description,
  size = "default",
  variant = "default",
  className,
}: {
  ids: number[];
  action: (input: { ids: number[] }) => Promise<ActionResult<{ closed: number; skipped: number }>>;
  label: React.ReactNode;
  title: string;
  description: React.ReactNode;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await action({ ids });
      if (res.ok) {
        toast.success(res.message ?? "Closed");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" size={size} variant={variant} className={className}>
          <CheckCircle2 aria-hidden /> {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Not now</AlertDialogCancel>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 aria-hidden />}
            {label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Put a closed order / bill back to ongoing. Needs a reason (kept in the activity log). */
export function ReopenButton({
  id,
  action,
  title,
  description,
}: {
  id: number;
  action: (input: { id: number; reason: string }) => Promise<ActionResult<unknown>>;
  title: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const submit = () => {
    if (!reason.trim()) {
      setError("Please write a short reason.");
      return;
    }
    start(async () => {
      const res = await action({ id, reason: reason.trim() });
      if (res.ok) {
        toast.success(res.message ?? "Reopened");
        setOpen(false);
        setReason("");
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline">
          <RotateCcw aria-hidden /> Reopen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`reopen-${id}`}>Reason</Label>
          <Textarea
            id={`reopen-${id}`}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(undefined);
            }}
            placeholder="e.g. Payment was entered against the wrong order"
            rows={2}
          />
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it closed</AlertDialogCancel>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Reopen
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
