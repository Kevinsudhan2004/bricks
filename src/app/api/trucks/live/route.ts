import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { getFleetLive } from "@/server/queries/trucks";

/** Owner's live map polls this every few seconds. */
export async function GET() {
  try {
    return NextResponse.json(await getFleetLive(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }
}
