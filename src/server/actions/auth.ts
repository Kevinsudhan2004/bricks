"use server";

import bcrypt from "bcryptjs";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { loginAttempts, sessions, users } from "@/db/schema";
import { homeFor } from "@/lib/auth";
import { createSession, destroySession, readSessionUser } from "@/lib/session";
import { audit } from "@/server/audit";

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;
// Compared against when the username doesn't exist, so timing doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export type LoginState = { error?: string; username?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!username || !password) return { error: "Enter your username and password.", username };

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [{ failures }] = await db
    .select({ failures: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.username, username), eq(loginAttempts.success, false), gt(loginAttempts.attemptedAt, since)));
  if (failures >= MAX_FAILURES) {
    return { error: `Too many wrong attempts. Please wait ${WINDOW_MINUTES} minutes and try again.`, username };
  }

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid || !user.active) {
    await db.insert(loginAttempts).values({ username, success: false });
    return {
      error: user && valid && !user.active ? "This login has been disabled. Contact the owner." : "Wrong username or password.",
      username,
    };
  }

  await db.insert(loginAttempts).values({ username, success: true });
  await createSession(user.id);
  // Housekeeping: drop expired sessions and month-old login attempts.
  await Promise.all([
    db.delete(sessions).where(lt(sessions.expiresAt, new Date())),
    db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, new Date(Date.now() - 30 * 86_400_000))),
  ]);
  await db.transaction((tx) =>
    audit(tx, { userId: user.id, action: "login", entity: "user", entityId: user.id, summary: `${user.name} signed in` }),
  );

  // Only allow internal redirects
  const target = next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.role);
  redirect(user.role === "employee" && !isEmployeePath(target) ? "/entry" : target);
}

function isEmployeePath(path: string) {
  return ["/entry", "/inbound", "/production", "/dispatch", "/suppliers", "/orders", "/customers"].some((p) => path === p || path.startsWith(`${p}/`));
}

export async function logoutAction(): Promise<void> {
  const user = await readSessionUser();
  if (user) {
    await db.transaction((tx) =>
      audit(tx, { userId: user.id, action: "logout", entity: "user", entityId: user.id, summary: `${user.name} signed out` }),
    );
  }
  await destroySession();
  redirect("/login");
}
