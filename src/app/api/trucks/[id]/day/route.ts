import { NextResponse, type NextRequest } from "next/server";
import { isValidIsoDate } from "@/domain/dates";
import { AuthError } from "@/lib/auth";
import { getTruckDay } from "@/server/queries/trucks";

const NO_STORE = { "Cache-Control": "private, no-store" };

function csvTime(ms: number) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

/** One truck's route for a day: JSON for the live history screen, `?format=csv` to download. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/trucks/[id]/day">) {
  const id = Number((await ctx.params).id);
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!Number.isInteger(id) || !isValidIsoDate(date)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    const day = await getTruckDay(id, date);
    if (!day) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (request.nextUrl.searchParams.get("format") === "csv") {
      const lines = ["date,time,latitude,longitude,speed_kmh,trip"];
      for (const [t, lat, lng, kmh, trip] of day.points) lines.push(`${date},${csvTime(t)},${lat},${lng},${kmh ?? ""},${trip + 1}`);
      const name = `${(day.truck.plateNo ?? day.truck.name).replace(/[^A-Za-z0-9]+/g, "-")}-${date}.csv`;
      return new NextResponse(lines.join("\n"), {
        headers: { ...NO_STORE, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
      });
    }
    return NextResponse.json(day, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }
}
