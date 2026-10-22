"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Pencil, Plus, Truck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { FormField } from "@/components/forms/form-parts";
import { OrderPicker, type OrderOption } from "@/components/forms/order-picker";
import { productColor } from "@/lib/colors";
import { formatCountCompact, formatDateShort, formatNumber } from "@/lib/format";
import { createDispatch, updateDispatch } from "@/server/actions/dispatch";

type Line = { productId: number; productName: string; productCode: string; max: number };
export type OrderLine = { productId: number; productName: string; productCode: string; pending: number };
export type DispatchOrder = Omit<OrderOption, "products"> & { customerId: number; products: OrderLine[] };

const num = (v: string | undefined) => Number(String(v ?? "").replace(/,/g, "")) || 0;

/** Quantity boxes, one per product still pending on the invoice. */
function QuantityInputs({
  lines,
  qty,
  setQty,
  errors,
  stock,
  idPrefix,
  maxLabel = "Pending",
}: {
  lines: Line[];
  qty: Record<number, string>;
  setQty: (productId: number, v: string) => void;
  errors: Record<string, string>;
  stock: Record<number, number>;
  idPrefix: string;
  maxLabel?: string;
}) {
  return (
    <>
      {lines.map((l, i) => {
        const value = num(qty[l.productId]);
        const over = value > l.max;
        const inYard = stock[l.productId];
        const error = errors[`qty.${l.productId}`] ?? (over ? (maxLabel === "Pending" ? `Only ${formatNumber(l.max)} pending` : `Max ${formatNumber(l.max)}`) : undefined);
        return (
          <FormField
            key={l.productId}
            label={
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: productColor(l.productCode, i) }} aria-hidden />
                {l.productName}
              </span>
            }
            error={error}
            htmlFor={`${idPrefix}-${l.productId}`}
            hint={
              <span className="flex flex-wrap items-center gap-x-2">
                <span>
                  {maxLabel} <span className="num font-medium text-foreground">{formatNumber(l.max)}</span>
                </span>
                {inYard !== undefined && (
                  <span className={cn(value > inYard && "font-medium text-warning-foreground dark:text-warning")}>
                    · yard {formatCountCompact(inYard)}
                  </span>
                )}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => setQty(l.productId, String(inYard !== undefined ? Math.max(Math.min(l.max, inYard), 0) : l.max))}
                >
                  All
                </button>
              </span>
            }
          >
            <Input
              id={`${idPrefix}-${l.productId}`}
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              aria-invalid={!!error || undefined}
              className="num text-lg font-semibold md:h-10"
              value={qty[l.productId] ?? ""}
              onChange={(e) => setQty(l.productId, e.target.value)}
            />
          </FormField>
        );
      })}
    </>
  );
}

function VehicleFields({
  vehicles,
  value,
  onChange,
  idPrefix,
}: {
  vehicles: string[];
  value: { vehicleNo: string; driverName: string; driverPhone: string };
  onChange: (v: Partial<{ vehicleNo: string; driverName: string; driverPhone: string }>) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <FormField label="Vehicle number" htmlFor={`${idPrefix}-veh`}>
        <Input
          id={`${idPrefix}-veh`}
          list={`${idPrefix}-vehicles`}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="TN 30 AB 1234"
          className="uppercase md:h-10"
          value={value.vehicleNo}
          onChange={(e) => onChange({ vehicleNo: e.target.value })}
        />
        <datalist id={`${idPrefix}-vehicles`}>
          {vehicles.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </FormField>
      <FormField label="Driver name" htmlFor={`${idPrefix}-drv`}>
        <Input id={`${idPrefix}-drv`} autoComplete="off" className="md:h-10" value={value.driverName} onChange={(e) => onChange({ driverName: e.target.value })} />
      </FormField>
      <FormField label="Driver phone" htmlFor={`${idPrefix}-drvph`}>
        <Input
          id={`${idPrefix}-drvph`}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          className="md:h-10"
          value={value.driverPhone}
          onChange={(e) => onChange({ driverPhone: e.target.value })}
        />
      </FormField>
    </div>
  );
}

/** Map server field errors (lines.<i>.quantity) back to product ids. */
function mapErrors(fieldErrors: Record<string, string> | undefined, productIds: number[]) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fieldErrors ?? {})) {
    const m = k.match(/^lines\.(\d+)\.quantity$/);
    if (m) out[`qty.${productIds[Number(m[1])]}`] = v;
    else out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Quick entry at the top of the Dispatch page                         */
/* ------------------------------------------------------------------ */

/**
 * Send a truck: pick the ORDER NUMBER, then type how many bricks are on the truck.
 * The customer comes from the order.
 */
export function DispatchQuickEntry({
  orders,
  stock,
  vehicles,
  today,
  minDate,
  initialOrderId,
  initialCustomerId,
  canCreateOrder,
}: {
  orders: DispatchOrder[];
  stock: Record<number, number>;
  vehicles: string[];
  today: string;
  minDate?: string;
  initialOrderId?: number;
  initialCustomerId?: number;
  canCreateOrder?: boolean;
}) {
  const [pending, start] = useTransition();
  const [date, setDate] = useState(today);
  const [orderId, setOrderId] = useState<number | undefined>(
    () =>
      orders.find((o) => o.id === initialOrderId)?.id ??
      (initialCustomerId ? orders.find((o) => o.customerId === initialCustomerId)?.id : undefined),
  );
  // Remember the customer so that when an order is completed we can move to their next order.
  const [customerId, setCustomerId] = useState<number | undefined>(() => orders.find((o) => o.id === orderId)?.customerId);
  const [qty, setQtyState] = useState<Record<number, string>>({});
  const [showVehicle, setShowVehicle] = useState(false);
  const [vehicle, setVehicle] = useState({ vehicleNo: "", driverName: "", driverPhone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // If the chosen order was just fully delivered, move on to the same customer's next open order.
  const order = orders.find((o) => o.id === orderId) ?? (customerId ? orders.find((o) => o.customerId === customerId) : undefined);
  const lines: Line[] = (order?.products ?? [])
    .filter((p) => p.pending > 0)
    .map((p) => ({ productId: p.productId, productName: p.productName, productCode: p.productCode, max: p.pending }));

  const setQty = (productId: number, v: string) => {
    setQtyState((q) => ({ ...q, [productId]: v }));
    setErrors((e) => {
      const next = { ...e };
      delete next[`qty.${productId}`];
      return next;
    });
  };

  const total = lines.reduce((a, l) => a + num(qty[l.productId]), 0);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const local: Record<string, string> = {};
    if (!order) local.order = "Choose the order number";
    if (!date) local.dispatchDate = "Pick a date";
    for (const l of lines) if (num(qty[l.productId]) > l.max) local[`qty.${l.productId}`] = `Only ${formatNumber(l.max)} pending`;
    if (order && total <= 0 && Object.keys(local).length === 0) local.form = "Enter how many bricks are on this truck.";
    setErrors(local);
    if (Object.keys(local).length || !order) {
      if (local.form) toast.error(local.form);
      return;
    }
    const productIds = lines.map((l) => l.productId);
    start(async () => {
      const res = await createDispatch({
        dispatchDate: date,
        customerId: order.customerId,
        invoiceId: order.id,
        vehicleNo: vehicle.vehicleNo,
        driverName: vehicle.driverName,
        driverPhone: vehicle.driverPhone,
        lines: lines.map((l) => ({ productId: l.productId, quantity: num(qty[l.productId]) })),
      });
      if (!res.ok) {
        setErrors(mapErrors(res.fieldErrors, productIds));
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved", {
        action: { label: "Print challan", onClick: () => window.open(`/print/challan/${res.data.id}`, "_blank") },
      });
      // Ready for the next truck on the same order: fresh numbers.
      setQtyState({});
      setVehicle({ vehicleNo: "", driverName: "", driverPhone: "" });
    });
  };

  return (
    <section aria-labelledby="add-dispatch" className="rounded-xl border border-primary/25 bg-card p-4 shadow-xs md:p-5">
      <h2 id="add-dispatch" className="mb-3 font-semibold">
        Send a truck
      </h2>
      {orders.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>No orders are waiting for delivery. Note the customer&apos;s order first, then dispatch against its number.</p>
          {canCreateOrder && (
            <NewEntryButton kind="order" variant="outline" className="shrink-0">
              <Plus aria-hidden /> New order
            </NewEntryButton>
          )}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
            <FormField label="Date" error={errors.dispatchDate} htmlFor="dc-date">
              <Input id="dc-date" type="date" max={today} min={minDate} className="md:h-10" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            <FormField
              label="Order number"
              error={errors.order}
              htmlFor="dc-order"
              hint={
                order ? (
                  <span>
                    {order.customerName}
                    {order.customerPhone ? ` · ${order.customerPhone}` : ""} · ordered {formatDateShort(order.orderDate)}
                  </span>
                ) : (
                  "Search by order number or customer name"
                )
              }
            >
              <OrderPicker
                id="dc-order"
                orders={orders}
                value={order?.id}
                invalid={!!errors.order}
                onChange={(o) => {
                  setOrderId(o.id);
                  setCustomerId(orders.find((x) => x.id === o.id)?.customerId);
                  setQtyState({});
                  setErrors({});
                }}
              />
            </FormField>
          </div>

          {order && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]">
              <QuantityInputs lines={lines} qty={qty} setQty={setQty} errors={errors} stock={stock} idPrefix="dc-qty" />
            </div>
          )}

          {showVehicle && order && (
            <VehicleFields vehicles={vehicles} value={vehicle} onChange={(v) => setVehicle((x) => ({ ...x, ...v }))} idPrefix="dc" />
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {order ? (
              <button
                type="button"
                onClick={() => setShowVehicle((v) => !v)}
                className="flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                aria-expanded={showVehicle}
              >
                <Truck className="size-4" aria-hidden />
                {showVehicle ? "Hide vehicle & driver" : "Vehicle & driver (optional)"}
                <ChevronDown className={cn("size-4 transition-transform", showVehicle && "rotate-180")} aria-hidden />
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              {total > 0 && (
                <span className="num text-sm text-muted-foreground">
                  Truck: <span className="font-semibold text-foreground">{formatNumber(total)}</span> nos
                </span>
              )}
              <Button type="submit" size="lg" className="flex-1 sm:flex-none sm:px-6 md:h-10" disabled={pending || !order}>
                {pending ? <Loader2 className="animate-spin" /> : <Check aria-hidden />}
                Save
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Edit a dispatch in a pop-up                                         */
/* ------------------------------------------------------------------ */

export function DispatchEditButton({
  dispatch,
  lines,
  stock,
  vehicles,
  today,
  minDate,
}: {
  dispatch: {
    id: number;
    dispatchNo: string;
    dispatchDate: string;
    customerId: number;
    customerName: string;
    invoiceId: number;
    invoiceNo: string;
    vehicleNo: string | null;
    driverName: string | null;
    driverPhone: string | null;
    quantities: Record<number, number>;
  };
  /** Products on the invoice, with max = still pending + what this truck already carries. */
  lines: Line[];
  stock: Record<number, number>;
  vehicles: string[];
  today: string;
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${dispatch.dispatchNo}`}>
          <Pencil aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {dispatch.dispatchNo}</DialogTitle>
          <DialogDescription>
            {dispatch.customerName} · {dispatch.invoiceNo}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <EditDispatchForm
            dispatch={dispatch}
            lines={lines}
            stock={stock}
            vehicles={vehicles}
            today={today}
            minDate={minDate}
            onSaved={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDispatchForm({
  dispatch,
  lines,
  stock,
  vehicles,
  today,
  minDate,
  onSaved,
}: Parameters<typeof DispatchEditButton>[0] & { onSaved: () => void }) {
  const [pending, start] = useTransition();
  const [date, setDate] = useState(dispatch.dispatchDate);
  const [qty, setQtyState] = useState<Record<number, string>>(
    Object.fromEntries(Object.entries(dispatch.quantities).map(([k, v]) => [k, String(v)])),
  );
  const [vehicle, setVehicle] = useState({
    vehicleNo: dispatch.vehicleNo ?? "",
    driverName: dispatch.driverName ?? "",
    driverPhone: dispatch.driverPhone ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Stock shown for editing includes this truck's own bricks.
  const editStock = Object.fromEntries(Object.entries(stock).map(([k, v]) => [k, v + (dispatch.quantities[Number(k)] ?? 0)]));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const productIds = lines.map((l) => l.productId);
    start(async () => {
      const res = await updateDispatch(dispatch.id, {
        dispatchDate: date,
        customerId: dispatch.customerId,
        invoiceId: dispatch.invoiceId,
        ...vehicle,
        lines: lines.map((l) => ({ productId: l.productId, quantity: num(qty[l.productId]) })),
      });
      if (!res.ok) {
        setErrors(mapErrors(res.fieldErrors, productIds));
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved");
      onSaved();
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <FormField label="Date" error={errors.dispatchDate} htmlFor={`dce-date-${dispatch.id}`}>
        <Input id={`dce-date-${dispatch.id}`} type="date" max={today} min={minDate} value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuantityInputs
          lines={lines}
          qty={qty}
          setQty={(id, v) => setQtyState((q) => ({ ...q, [id]: v }))}
          errors={errors}
          stock={editStock}
          idPrefix={`dce-${dispatch.id}`}
          maxLabel="Up to"
        />
      </div>
      <VehicleFields vehicles={vehicles} value={vehicle} onChange={(v) => setVehicle((x) => ({ ...x, ...v }))} idPrefix={`dce-${dispatch.id}`} />
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Check aria-hidden />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
