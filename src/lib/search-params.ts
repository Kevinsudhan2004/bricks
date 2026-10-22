export type SearchParams = Record<string, string | string[] | undefined>;

/** Flatten Next.js searchParams into plain string pairs (first value wins). */
export function flatParams(sp: SearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val !== undefined && val !== "") out[k] = val;
  }
  return out;
}

export function intParam(sp: SearchParams, key: string): number | null {
  const v = sp[key];
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function strParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s || undefined;
}
