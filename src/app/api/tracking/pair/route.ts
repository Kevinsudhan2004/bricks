import { NextResponse, type NextRequest } from "next/server";
import { clientIp, DEVICE_SETTINGS, pairBody, pairDevice } from "@/server/tracking";

const NO_STORE = { "Cache-Control": "no-store" };

/** Driver app: swap the owner's one-time 8-digit code for this phone's own access token. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = pairBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Type the 8-digit code shown in the office app." }, { status: 400, headers: NO_STORE });
  }
  const res = await pairDevice(parsed.data, clientIp(request));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status, headers: NO_STORE });
  return NextResponse.json({ token: res.token, truck: res.truck, settings: DEVICE_SETTINGS }, { headers: NO_STORE });
}
