/** Round to 2 decimals (paise) avoiding binary float drift, e.g. 1.005 → 1.01. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sum(values: readonly number[]): number {
  return round2(values.reduce((acc, v) => acc + v, 0));
}

/** Parse numeric DB values that may arrive as strings (aggregates) or null. */
export function num(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
