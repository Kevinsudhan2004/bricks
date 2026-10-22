import "server-only";
import { io } from "next/cache";
import { DEFAULT_TZ, todayIn } from "@/domain/dates";

export const APP_TIMEZONE = process.env.APP_TIMEZONE || DEFAULT_TZ;

/**
 * Today's business date (YYYY-MM-DD) in the factory's timezone.
 * `io()` tells Cache Components this reads the clock, so it is resolved per request.
 */
export async function today(): Promise<string> {
  await io();
  return todayIn(APP_TIMEZONE);
}
