"use client";

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Copy, Download, KeyRound, Loader2, Plus, RefreshCw, Save, Smartphone } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/forms/form-parts";
import { formatDateTime } from "@/lib/format";
import { DRIVER_APK_PATH } from "@/lib/tracking";
import { truckSchema, type TruckInput } from "@/lib/validators";
import { makePairCode, saveTruck, unlinkTruckPhone } from "@/server/actions/trucks";
import type { FleetTruck } from "@/server/queries/trucks";

type Output = z.output<typeof truckSchema>;
const EMPTY: TruckInput = { name: "", plateNo: "", driverName: "", driverPhone: "", active: true };

export function truckInput(t: FleetTruck): TruckInput {
  return { name: t.name, plateNo: t.plateNo ?? "", driverName: t.driverName ?? "", driverPhone: t.driverPhone ?? "", active: t.active };
}

/* ------------------------------------------------------------------ */
/* Add / edit                                                          */
/* ------------------------------------------------------------------ */

export function TruckFormDialog({
  id,
  initial,
  open,
  onOpenChange,
  onSaved,
}: {
  id: number | null;
  initial?: TruckInput;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: number, isNew: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{id ? "Edit truck" : "Add a truck"}</DialogTitle>
          <DialogDescription>The name and number plate show on the map and on the driver&apos;s phone.</DialogDescription>
        </DialogHeader>
        {open && <TruckFields id={id} initial={initial ?? EMPTY} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function TruckFields({ id, initial, onSaved }: { id: number | null; initial: TruckInput; onSaved: (id: number, isNew: boolean) => void }) {
  const [pending, start] = useTransition();
  const { register, control, handleSubmit, formState, setError } = useForm<TruckInput, unknown, Output>({
    resolver: zodResolver(truckSchema),
    defaultValues: initial,
  });
  const e = formState.errors;
  const key = id ?? "new";

  const onSubmit = (values: Output) =>
    start(async () => {
      const res = await saveTruck(id, values);
      if (!res.ok) {
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof TruckInput, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      onSaved(res.data.id, id === null);
    });

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FormField label="Truck name" error={e.name?.message} required htmlFor={`t-name-${key}`}>
        <Input id={`t-name-${key}`} autoComplete="off" placeholder="e.g. Eicher 1" {...register("name")} />
      </FormField>
      <FormField label="Number plate" error={e.plateNo?.message} htmlFor={`t-plate-${key}`}>
        <Input id={`t-plate-${key}`} autoComplete="off" placeholder="TN 05 AB 1234" className="uppercase" maxLength={20} {...register("plateNo")} />
      </FormField>
      <FormField label="Driver name" error={e.driverName?.message} htmlFor={`t-driver-${key}`}>
        <Input id={`t-driver-${key}`} autoComplete="off" {...register("driverName")} />
      </FormField>
      <FormField label="Driver phone" error={e.driverPhone?.message} htmlFor={`t-phone-${key}`}>
        <Input id={`t-phone-${key}`} type="tel" inputMode="tel" autoComplete="off" {...register("driverPhone")} />
      </FormField>
      {id !== null && (
        <div className="flex items-center gap-3 sm:col-span-2">
          <Controller
            control={control}
            name="active"
            render={({ field }) => <Switch id={`t-active-${key}`} checked={field.value} onCheckedChange={field.onChange} />}
          />
          <label htmlFor={`t-active-${key}`} className="text-sm">
            Show this truck on the map (turn off for sold or idle trucks)
          </label>
        </div>
      )}
      <Button type="submit" size="lg" className="sm:col-span-2" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : id ? <Save aria-hidden /> : <Plus aria-hidden />}
        {id ? "Save" : "Add truck"}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Link the driver's phone                                             */
/* ------------------------------------------------------------------ */

function useQr(text: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    let live = true;
    import("qrcode").then((QR) =>
      QR.toDataURL(text, { margin: 1, width: 360, errorCorrectionLevel: "M" }).then((url) => {
        if (live) setSrc(url);
      }),
    );
    return () => {
      live = false;
    };
  }, [text]);
  return text ? src : null;
}

export function LinkPhoneDialog({
  truck,
  open,
  onOpenChange,
  onChanged,
}: {
  truck: FleetTruck | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [made, setMade] = useState<{ truckId: number; code: string; expiresAt: number } | null>(null);
  const [pending, start] = useTransition();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const apkUrl = origin ? `${origin}${DRIVER_APK_PATH}` : null;
  const qr = useQr(open ? apkUrl : null);

  const current =
    made && made.truckId === truck?.id
      ? made
      : truck?.pairCode && truck.pairCodeExpiresAt
        ? { truckId: truck.id, code: truck.pairCode, expiresAt: truck.pairCodeExpiresAt }
        : null;

  const newCode = () =>
    start(async () => {
      if (!truck) return;
      const res = await makePairCode(truck.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setMade({ truckId: truck.id, ...res.data });
      onChanged();
    });

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy. Select and copy it by hand.");
    }
  };

  const code = current ? `${current.code.slice(0, 4)} ${current.code.slice(4)}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-x-hidden overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="size-5" aria-hidden /> Link driver&apos;s phone
          </DialogTitle>
          <DialogDescription>
            {truck?.name}
            {truck?.plateNo ? ` · ${truck.plateNo}` : ""}
            {truck?.phone ? " — a phone is already linked; linking a new one disconnects it." : ""}
          </DialogDescription>
        </DialogHeader>

        {/^(localhost|127\.|\[::1\])/.test(origin.replace(/^https?:\/\//, "")) && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            This page is open as <span className="font-mono">localhost</span>, which a phone can&apos;t reach. Open the CRM using this
            computer&apos;s network address (like <span className="font-mono">http://192.168.x.x:3100</span>) or the hosted address, then
            link the phone from there.
          </p>
        )}

        <ol className="space-y-5 text-sm">
          <li className="grid grid-cols-[auto_1fr] gap-3">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
            <div className="min-w-0 space-y-2">
              <p className="font-medium">Install the Truck Tracker app on the driver&apos;s Android phone</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR code to download the driver app" className="size-36 shrink-0 rounded-lg border bg-white p-1" />
                ) : (
                  <div className="size-36 shrink-0 animate-pulse rounded-lg bg-muted" />
                )}
                <div className="min-w-0 space-y-2 text-muted-foreground">
                  <p>Scan with the phone camera, or open this link on the phone:</p>
                  <p className="font-mono text-xs break-all text-foreground">{apkUrl}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => apkUrl && copy(apkUrl, "Link")}>
                      <Copy aria-hidden /> Copy link
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href={DRIVER_APK_PATH} download>
                        <Download aria-hidden /> APK file
                      </a>
                    </Button>
                  </div>
                  <p className="text-xs">Android will ask to allow installing apps from the browser — tap Allow.</p>
                </div>
              </div>
            </div>
          </li>

          <li className="grid grid-cols-[auto_1fr] gap-3">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
            <div className="min-w-0 space-y-2">
              <p className="font-medium">Open the app and type this code</p>
              {current ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="num rounded-xl border-2 border-dashed border-primary/50 bg-accent/40 px-4 py-2 font-mono text-3xl font-bold tracking-[0.2em]">
                      {code}
                    </p>
                    <Button type="button" variant="ghost" size="icon" aria-label="Copy code" onClick={() => copy(current.code, "Code")}>
                      <Copy aria-hidden />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Works once, until {formatDateTime(new Date(current.expiresAt))}.{" "}
                    <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={newCode} disabled={pending}>
                      Make a new code
                    </button>
                  </p>
                </>
              ) : (
                <Button type="button" onClick={newCode} disabled={pending || !truck}>
                  {pending ? <Loader2 className="animate-spin" /> : <KeyRound aria-hidden />} Make link code
                </Button>
              )}
            </div>
          </li>

          <li className="grid grid-cols-[auto_1fr] gap-3">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">3</span>
            <div className="min-w-0 space-y-1 text-muted-foreground">
              <p className="font-medium text-foreground">If the app asks for the office address, enter</p>
              <p className="font-mono text-xs break-all text-foreground">{origin}</p>
              <p className="text-xs">Then the driver taps the big green START button at the beginning of every trip.</p>
            </div>
          </li>
        </ol>

        {current && (
          <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => onOpenChange(false)}>
            <RefreshCw aria-hidden /> Done — the truck appears on the map when the driver taps Start
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Unlink                                                              */
/* ------------------------------------------------------------------ */

export function UnlinkPhoneDialog({
  truck,
  open,
  onOpenChange,
  onChanged,
}: {
  truck: FleetTruck | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unlink the phone from {truck?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The app on {truck?.phone?.model ?? "the driver's phone"} stops sending locations straight away. Location history is kept. Use
            this if the phone is lost or the driver changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep linked</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(ev) => {
              ev.preventDefault();
              if (!truck) return;
              start(async () => {
                const res = await unlinkTruckPhone(truck.id);
                if (!res.ok) toast.error(res.error);
                else {
                  toast.success(res.message ?? "Unlinked");
                  onChanged();
                  onOpenChange(false);
                }
              });
            }}
          >
            {pending && <Loader2 className="animate-spin" />} Unlink phone
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
