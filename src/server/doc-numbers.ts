import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { docCounters } from "@/db/schema";
import { financialYear } from "@/domain/dates";
import { DOC_PREFIX, formatDocNo, type DocKind } from "@/domain/doc-numbers";

/** Atomically allocate the next document number for the financial year of `date`. */
export async function nextDocNumber(tx: Tx, kind: DocKind, date: string): Promise<string> {
  const prefix = DOC_PREFIX[kind];
  const fy = financialYear(date);
  const [row] = await tx
    .insert(docCounters)
    .values({ prefix, fy, lastValue: 1 })
    .onConflictDoUpdate({
      target: [docCounters.prefix, docCounters.fy],
      set: { lastValue: sql`${docCounters.lastValue} + 1` },
    })
    .returning({ value: docCounters.lastValue });
  return formatDocNo(prefix, fy, row.value);
}
