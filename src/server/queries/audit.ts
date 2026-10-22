import "server-only";
import { desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { TAG } from "@/server/tags";

async function loadAudit(limit: number) {
  "use cache";
  cacheTag(TAG.audit, TAG.users);
  cacheLife("live");
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      summary: auditLogs.summary,
      createdAt: auditLogs.createdAt,
      userName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function getAuditLog(limit = 300) {
  await requireOwner();
  return loadAudit(limit);
}
