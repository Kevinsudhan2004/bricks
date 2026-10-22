import "server-only";
import { unstable_rethrow } from "next/navigation";
import { updateTag } from "next/cache";
import type { z } from "zod";
import { AuthError } from "@/lib/auth";
import { TAG, type Tag } from "./tags";

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export class UserError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Wrap a Server Action body: maps auth/validation errors to a friendly result, rethrows redirects. */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AuthError) return { ok: false, error: err.message };
    if (err instanceof UserError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    console.error("[action]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Parse input with a zod schema or throw a UserError carrying per-field messages. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const first = result.error.issues[0]?.message ?? "Please check the form.";
  throw new UserError(Object.keys(fieldErrors).length ? "Please fix the highlighted fields." : first, fieldErrors);
}

/** Expire cache tags after a write (read-your-own-writes). Audit log always refreshes too. */
export function expire(...tags: Tag[]) {
  for (const tag of new Set<Tag>([...tags, TAG.audit])) updateTag(tag);
}
