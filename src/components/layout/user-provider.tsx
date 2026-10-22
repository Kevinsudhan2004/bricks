"use client";

import { createContext, use } from "react";
import type { SessionUser } from "@/lib/session";

const UserContext = createContext<Promise<SessionUser> | null>(null);

export function UserProvider({
  userPromise,
  children,
}: {
  userPromise: Promise<SessionUser>;
  children: React.ReactNode;
}) {
  return <UserContext value={userPromise}>{children}</UserContext>;
}

/** Resolve the signed-in user in a Client Component. Suspends: keep callers behind <Suspense>. */
export function useUser(): SessionUser {
  const promise = use(UserContext);
  if (!promise) throw new Error("useUser must be used within <UserProvider>");
  return use(promise);
}
