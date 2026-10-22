import "server-only";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { customers, dispatches, invoices, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { TAG } from "@/server/tags";

type DispatchItemJson = { productId: number; name: string; code: string; quantity: number };

const itemsJson = sql<DispatchItemJson[]>`(
  select coalesce(json_agg(json_build_object('productId', di.product_id, 'name', p.name, 'code', p.code, 'quantity', di.quantity) order by p.sort_order), '[]'::json)
  from dispatch_items di join products p on p.id = di.product_id where di.dispatch_id = ${dispatches.id})`;

async function loadDispatches(from: string, to: string, customerId: number | null) {
  "use cache";
  cacheTag(TAG.dispatch, TAG.customers, TAG.masters, TAG.invoices);
  cacheLife("live");
  const where = and(
    isNull(dispatches.deletedAt),
    gte(dispatches.dispatchDate, from),
    lte(dispatches.dispatchDate, to),
    customerId ? eq(dispatches.customerId, customerId) : undefined,
  );
  return db
    .select({
      id: dispatches.id,
      dispatchNo: dispatches.dispatchNo,
      dispatchDate: dispatches.dispatchDate,
      customerId: dispatches.customerId,
      customerName: customers.name,
      firmName: customers.firmName,
      invoiceId: dispatches.invoiceId,
      invoiceNo: invoices.invoiceNo,
      vehicleNo: dispatches.vehicleNo,
      driverName: dispatches.driverName,
      driverPhone: dispatches.driverPhone,
      remarks: dispatches.remarks,
      createdBy: dispatches.createdBy,
      createdByName: users.name,
      createdAt: dispatches.createdAt,
      items: itemsJson,
    })
    .from(dispatches)
    .innerJoin(customers, eq(customers.id, dispatches.customerId))
    .innerJoin(invoices, eq(invoices.id, dispatches.invoiceId))
    .innerJoin(users, eq(users.id, dispatches.createdBy))
    .where(where)
    .orderBy(desc(dispatches.dispatchDate), desc(dispatches.createdAt))
    .limit(500);
}

export type DispatchRow = Awaited<ReturnType<typeof loadDispatches>>[number];

export async function getDispatchList(from: string, to: string, customerId: number | null) {
  await getCurrentUser();
  return loadDispatches(from, to, customerId);
}

async function loadDispatch(id: number) {
  "use cache";
  cacheTag(TAG.dispatch, TAG.customers, TAG.masters, TAG.invoices);
  cacheLife("live");
  const [row] = await db
    .select({
      dispatch: dispatches,
      // No money fields: employees can open challans.
      customer: {
        id: customers.id,
        name: customers.name,
        firmName: customers.firmName,
        phone: customers.phone,
        gstin: customers.gstin,
        billingAddress: customers.billingAddress,
        siteAddress: customers.siteAddress,
      },
      invoiceNo: invoices.invoiceNo,
      invoiceDate: invoices.invoiceDate,
      deliveryAddress: invoices.deliveryAddress,
      createdByName: users.name,
      items: itemsJson,
    })
    .from(dispatches)
    .innerJoin(customers, eq(customers.id, dispatches.customerId))
    .innerJoin(invoices, eq(invoices.id, dispatches.invoiceId))
    .innerJoin(users, eq(users.id, dispatches.createdBy))
    .where(and(eq(dispatches.id, id), isNull(dispatches.deletedAt)));
  return row ?? null;
}

export async function getDispatch(id: number) {
  await getCurrentUser();
  return loadDispatch(id);
}
