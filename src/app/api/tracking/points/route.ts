import { NextResponse, type NextRequest } from "next/server";
import { batchBody, deviceFromRequest, DEVICE_SETTINGS, ingestBatch } from "@/server/tracking";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BYTES = 512 * 1024;

/**
 * Driver app: upload queued GPS fixes and trip start/stop events.
 * The phone deletes its copy only after a 200, so this must be safe to receive twice.
 */
export async function POST(request: NextRequest) {
  const device = await deviceFromRequest(request);
  if (!device) return NextResponse.json({ error: "unlinked" }, { status: 401, headers: NO_STORE });

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return NextResponse.json({ error: "Batch too large" }, { status: 413, headers: NO_STORE });
  }
  const parsed = batchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // 422 tells the phone to drop this batch instead of retrying it forever.
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad batch" }, { status: 422, headers: NO_STORE });
  }
  const result = await ingestBatch(device, parsed.data);
  return NextResponse.json({ ok: true, ...result, settings: DEVICE_SETTINGS }, { headers: NO_STORE });
}
