/** Indian-style formatting helpers (₹, lakhs/crores, dates). Safe on server and client. */

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** ₹1,23,456.50 */
export function formatINR(value: number, opts: { decimals?: boolean } = {}): string {
  return (opts.decimals === false ? inr0 : inr).format(value);
}

/** Short money for KPI tiles and chart axes: ₹2.4 Cr, ₹45.2 L, ₹12.5 K */
export function formatINRCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}₹${dec2.format(abs / 1e7)} Cr`;
  if (abs >= 1e5) return `${sign}₹${dec1.format(abs / 1e5)} L`;
  if (abs >= 1e3) return `${sign}₹${dec1.format(abs / 1e3)} K`;
  return `${sign}₹${int.format(abs)}`;
}

/** 1,25,000 */
export function formatNumber(value: number): string {
  return int.format(value);
}

/** Compact counts for chart axes: 25K, 1.2L */
export function formatCountCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${dec1.format(value / 1e7)}Cr`;
  if (abs >= 1e5) return `${dec1.format(value / 1e5)}L`;
  if (abs >= 1e3) return `${dec1.format(value / 1e3)}K`;
  return int.format(value);
}

export function formatDecimal(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value);
}

/** Weight: kg below one tonne, tonnes above (12.5 t). */
export function formatWeight(kg: number): string {
  if (Math.abs(kg) >= 1000) return `${dec2.format(kg / 1000)} t`;
  return `${int.format(kg)} kg`;
}

export function formatKg(kg: number): string {
  return `${dec2.format(kg)} kg`;
}

export function formatTonnes(kg: number): string {
  return `${dec1.format(kg / 1000)} t`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-09" → "9 Oct 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-10-09" → "9 Oct" */
export function formatDateShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "2026-10" → "Oct 26" */
export function formatMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

/** Relative label used on lists: Today / Yesterday / 9 Oct */
export function formatDay(iso: string, today: string): string {
  if (iso === today) return "Today";
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  if (iso === t.toISOString().slice(0, 10)) return "Yesterday";
  return iso.slice(0, 4) === today.slice(0, 4) ? formatDateShort(iso) : formatDate(iso);
}

export function formatTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(typeof date === "string" ? new Date(date) : date);
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(typeof date === "string" ? new Date(date) : date);
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

/** Amount in words for invoices: "Rupees One Lakh Twenty Thousand Only" */
export function amountInWords(value: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`);
  const three = (n: number) =>
    n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${two(n % 100)}` : ""}` : two(n);

  const rupees = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Rupees Zero Only";

  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7);
  const lakh = Math.floor((rupees % 1e7) / 1e5);
  const thousand = Math.floor((rupees % 1e5) / 1e3);
  const rest = rupees % 1e3;
  if (crore) parts.push(`${crore >= 100 ? three(crore) : two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));

  let words = `Rupees ${parts.join(" ")}`;
  if (paise) words += ` and ${two(paise)} Paise`;
  return `${words} Only`;
}
