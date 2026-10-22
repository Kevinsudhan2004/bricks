import { NextResponse, type NextRequest } from "next/server";
import { actionUser, AuthError } from "@/lib/auth";
import { today } from "@/lib/today";
import { getActiveMasters, getCompany, getCustomerOptions } from "@/server/queries/masters";
import { getInvoiceBalancesByCustomer } from "@/server/queries/money";

/** Everything a pop-up entry form needs (customers, products, open balances), loaded when the sheet opens. */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/entry-form/[kind]">) {
  const { kind } = await params;
  try {
    const user = await actionUser(kind === "payment" || kind === "note" ? ["owner"] : undefined);
    const isOwner = user.role === "owner";
    const t = await today();

    if (kind === "customer") {
      const company = await getCompany();
      return NextResponse.json({ defaultState: company?.stateName ?? null, showMoney: isOwner });
    }

    if (kind === "order") {
      const [company, masters, customers] = await Promise.all([getCompany(), getActiveMasters(), getCustomerOptions()]);
      return NextResponse.json({
        customers,
        // Employees never receive rates: the server applies them.
        products: masters.products.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          size: p.size,
          defaultRate: isOwner ? p.defaultRate : 0,
          gstRate: isOwner ? p.gstRate : 0,
        })),
        companyState: company?.stateName ?? null,
        defaultDueDays: company?.defaultDueDays ?? 15,
        today: t,
        showMoney: isOwner,
      });
    }

    if (kind === "payment" || kind === "note") {
      const [customers, balances] = await Promise.all([getCustomerOptions(), getInvoiceBalancesByCustomer(t)]);
      return NextResponse.json({ customers, balances, today: t });
    }
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }
  return NextResponse.json({ error: "Unknown form" }, { status: 404 });
}
