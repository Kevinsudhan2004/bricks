import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { companySettings, customers, materials, productRecipes, products, suppliers, users } from "@/db/schema";
import { getCurrentUser, requireOwner } from "@/lib/auth";
import { TAG } from "@/server/tags";

/*
 * Data Access Layer pattern: exported getters authorize first, then call
 * unexported `use cache` loaders. Loaders never read cookies, so they can be
 * shared across users and invalidated by tag after every write.
 */

async function loadCompany() {
  "use cache";
  cacheTag(TAG.settings);
  cacheLife("max");
  const [row] = await db.select().from(companySettings).where(eq(companySettings.id, 1));
  return row ?? null;
}

async function loadMasters() {
  "use cache";
  cacheTag(TAG.masters);
  cacheLife("max");
  const [productRows, materialRows, recipeRows, supplierRows] = await Promise.all([
    db.select().from(products).orderBy(asc(products.sortOrder), asc(products.id)),
    db.select().from(materials).orderBy(asc(materials.sortOrder), asc(materials.id)),
    db.select().from(productRecipes),
    db.select().from(suppliers).orderBy(asc(suppliers.name)),
  ]);
  return { products: productRows, materials: materialRows, recipes: recipeRows, suppliers: supplierRows };
}

async function loadCustomerOptions() {
  "use cache";
  cacheTag(TAG.customers);
  cacheLife("max");
  return db
    .select({
      id: customers.id,
      name: customers.name,
      firmName: customers.firmName,
      phone: customers.phone,
      stateName: customers.stateName,
      siteAddress: customers.siteAddress,
      active: customers.active,
    })
    .from(customers)
    .orderBy(asc(customers.name));
}

async function loadUsers() {
  "use cache";
  cacheTag(TAG.users);
  cacheLife("max");
  return db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      phone: users.phone,
      role: users.role,
      active: users.active,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.role), asc(users.name));
}

export async function getCompanyBrand(): Promise<{ name: string }> {
  await getCurrentUser();
  const company = await loadCompany();
  return { name: company?.name || "Brick CRM" };
}

export async function getCompany() {
  await getCurrentUser();
  return loadCompany();
}

export async function getMasters() {
  await getCurrentUser();
  return loadMasters();
}

/** Internal (already-authorized callers, e.g. route handlers that checked the role themselves). */
export async function loadMastersUnchecked() {
  return loadMasters();
}

/** Active products/materials/suppliers for entry forms. */
export async function getActiveMasters() {
  const m = await getMasters();
  return {
    products: m.products.filter((p) => p.active),
    materials: m.materials.filter((x) => x.active),
    suppliers: m.suppliers.filter((x) => x.active),
    recipes: m.recipes,
  };
}

export async function getCustomerOptions() {
  await getCurrentUser();
  return (await loadCustomerOptions()).filter((c) => c.active);
}

export async function getAllCustomerOptions() {
  await requireOwner();
  return loadCustomerOptions();
}

export async function getUsers() {
  await requireOwner();
  return loadUsers();
}
