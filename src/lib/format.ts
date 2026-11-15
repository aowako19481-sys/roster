const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money = (value: number | string | null | undefined) => usd.format(Number(value ?? 0));
export const moneyWhole = (value: number | string | null | undefined) => usdWhole.format(Number(value ?? 0));
export const pct = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "–" : `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** "14 Nov 2026" */
export function day(value: string | Date | null | undefined, timeZone = "America/New_York") {
  if (!value) return "–";
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(date);
}

/** "14 Nov, 2:05 pm" */
export function dayTime(value: string | Date | null | undefined, timeZone = "America/New_York") {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  const d = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }).format(date);
  const t = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(date).toLowerCase();
  return `${d}, ${t}`;
}

export function todayIso(timeZone = "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
