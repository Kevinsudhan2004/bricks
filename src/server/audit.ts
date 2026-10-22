import "server-only";
import type { Tx } from "@/db";
import { auditLogs } from "@/db/schema";

export type AuditAction = "create" | "update" | "delete" | "cancel" | "login" | "logout" | "link" | "unlink";

export async function audit(
  tx: Tx,
  entry: {
    /** null for things a device did on its own (e.g. a driver phone linking itself) */
    userId: number | null;
    action: AuditAction;
    entity: string;
    entityId?: number | null;
    summary: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.insert(auditLogs).values({
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
