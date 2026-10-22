import "server-only";
import { cacheLife } from "next/cache";
import { redirect } from "next/navigation";
import { readSessionUser, type SessionUser } from "./session";

export type { SessionUser };
export type Role = SessionUser["role"];

/**
 * Current user for rendering. Cached privately in the browser (never on the server)
 * so authenticated routes can be prefetched; redirects to /login when signed out.
 * Server Actions must NOT rely on this: use `actionUser()` which re-validates.
 */
export async function getCurrentUser(): Promise<SessionUser> {
  "use cache: private";
  cacheLife({ stale: 300 });
  const user = await readSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Render guard for owner-only pages. Employees are sent to their entry home. */
export async function requireOwner(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (user.role !== "owner") redirect("/entry");
  return user;
}

export function homeFor(role: Role): string {
  return role === "owner" ? "/dashboard" : "/entry";
}

export class AuthError extends Error {}

/** Authorization for Server Actions and Route Handlers: always re-reads the session. */
export async function actionUser(roles?: Role[]): Promise<SessionUser> {
  const user = await readSessionUser();
  if (!user) throw new AuthError("Your session has expired. Please sign in again.");
  if (roles && !roles.includes(user.role)) throw new AuthError("You don't have permission to do that.");
  return user;
}
