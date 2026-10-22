import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { truckDevices } from "@/db/schema";
import { deviceFromRequest, DEVICE_SETTINGS, truckInfo } from "@/server/tracking";

const NO_STORE = { "Cache-Control": "no-store" };

/** Driver app: check the link is still valid and refresh the truck name/number shown on the phone. */
export async function GET(request: NextRequest) {
  const device = await deviceFromRequest(request);
  if (!device) return NextResponse.json({ error: "unlinked" }, { status: 401, headers: NO_STORE });
  const app = request.headers.get("x-app-version")?.slice(0, 20);
  await db
    .update(truckDevices)
    .set({ lastSeenAt: new Date(), ...(app ? { appVersion: app } : {}) })
    .where(eq(truckDevices.id, device.deviceId));
  return NextResponse.json({ truck: truckInfo(device.truck), settings: DEVICE_SETTINGS }, { headers: NO_STORE });
}
