import "server-only";
import { addDays, todayIn } from "@/domain/dates";
import type { SessionUser } from "@/lib/session";
import { APP_TIMEZONE } from "@/lib/today";
import { UserError } from "./action-utils";

/** Today in the factory timezone, for use inside Server Actions. */
export function actionToday(): string {
  return todayIn(APP_TIMEZONE);
}

export function canModifyEntry(user: SessionUser, row: { createdBy: number; createdAt: Date }, today: string) {
  if (user.role === "owner") return true;
  return row.createdBy === user.id && todayIn(APP_TIMEZONE, row.createdAt) === today;
}

/** Employees may change only their own entries, and only on the day they made them. */
export function assertCanModifyEntry(user: SessionUser, row: { createdBy: number; createdAt: Date }) {
  if (user.role === "owner") return;
  if (row.createdBy !== user.id) throw new UserError("You can only change entries that you made.");
  if (todayIn(APP_TIMEZONE, row.createdAt) !== actionToday()) {
    throw new UserError("Entries can only be changed on the same day. Please ask the owner to correct it.");
  }
}

/** Entry dates can't be in the future; employees can back-date by at most 2 days. */
export function assertEntryDate(user: SessionUser, date: string, field = "entryDate") {
  const today = actionToday();
  if (date > today) throw new UserError("The date can't be in the future.", { [field]: "The date can't be in the future." });
  if (user.role === "employee" && date < addDays(today, -2)) {
    const msg = "You can only enter the last 2 days. Ask the owner for older entries.";
    throw new UserError(msg, { [field]: msg });
  }
}
