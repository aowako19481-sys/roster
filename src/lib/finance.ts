// Shared helpers for the Finance pages. Nothing here decides a rider check or
// a payout for a real deal: the database does that on save and the pages read
// the answer back. The one calculation below (`scratchCalc`) is for the
// calculator scratchpad only and mirrors the database's rule.

import type { Tone } from "@/components/ui";

export const DEAL_TYPES = [
  { value: "landlord", label: "Landlord" },
  { value: "seller", label: "Seller" },
  { value: "tenant", label: "Tenant" },
  { value: "buyer", label: "Buyer" },
  { value: "dual", label: "Dual" },
  { value: "pass_through", label: "Pass-through" },
  { value: "referral", label: "Referral" },
] as const;
export const DEAL_TYPE_VALUES: readonly string[] = DEAL_TYPES.map((t) => t.value);
export const dealTypeLabel = (value: string) => DEAL_TYPES.find((t) => t.value === value)?.label ?? value;

export const DEAL_STATUSES = [
  { value: "open", label: "Open" },
  { value: "cleared", label: "Cleared" },
  { value: "held", label: "Held" },
  { value: "processed", label: "Processed" },
  { value: "closed", label: "Closed" },
] as const;
export const DEAL_STATUS_VALUES: readonly string[] = DEAL_STATUSES.map((s) => s.value);
export const dealStatusLabel = (value: string) => DEAL_STATUSES.find((s) => s.value === value)?.label ?? value;
export function dealStatusTone(value: string): Tone {
  if (value === "cleared") return "ok";
  if (value === "held") return "bad";
  if (value === "processed") return "dark";
  if (value === "closed") return "muted";
  return "plain";
}
/** Processed and closed deals are frozen by the database. */
export const isFrozen = (status: string) => status === "processed" || status === "closed";

export const PARTY_KINDS = [
  { value: "landlord", label: "Landlord" },
  { value: "tenant", label: "Tenant" },
  { value: "seller", label: "Seller" },
  { value: "buyer", label: "Buyer" },
] as const;
export const PARTY_KIND_VALUES: readonly string[] = PARTY_KINDS.map((p) => p.value);

export const FEE_KINDS = [
  { value: "referral", label: "Referral fee" },
  { value: "outside", label: "Outside-brokerage fee" },
] as const;
export const feeKindLabel = (value: string) => FEE_KINDS.find((f) => f.value === value)?.label ?? value;

export const PAYMENT_METHODS = [
  { value: "check", label: "Check" },
  { value: "wire", label: "Wire" },
  { value: "hyfin", label: "Hyfin" },
] as const;
export const PAYMENT_METHOD_VALUES: readonly string[] = PAYMENT_METHODS.map((m) => m.value);
export const paymentMethodLabel = (value: string) => PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;

/** The fixed list of override reasons. The database refuses anything else. */
export const OVERRIDE_REASONS = [
  { value: "signed_amendment_pending", label: "Signed amendment pending" },
  { value: "broker_approved_exception", label: "Broker-approved exception" },
  { value: "data_entry_correction", label: "Data entry correction" },
  { value: "legacy_agreement", label: "Legacy agreement" },
] as const;
export const OVERRIDE_REASON_VALUES: readonly string[] = OVERRIDE_REASONS.map((r) => r.value);
export const overrideReasonLabel = (value: string | null | undefined) =>
  OVERRIDE_REASONS.find((r) => r.value === value)?.label ?? (value || "No reason recorded");

export const DEFAULT_CHECKLIST = [
  "Notice of contract (NOC)",
  "Compliance documents",
  "Board package",
  "Signed lease or contract",
] as const;

export const WAITING_LABELS: Record<string, string> = { finance: "Finance", agent: "Agent", nobody: "Nobody" };
export const waitingLabel = (value: string) => WAITING_LABELS[value] ?? value;

// ------------------------------------------------------------ rider check --

export type CheckStatus = "correct" | "incorrect" | "needs_approval" | "skipped" | "overridden";

const CHECK: Record<string, { label: string; tone: Tone }> = {
  correct: { label: "Correct", tone: "ok" },
  incorrect: { label: "Incorrect", tone: "bad" },
  needs_approval: { label: "Needs approval", tone: "warn" },
  overridden: { label: "Overridden", tone: "dark" },
  skipped: { label: "Not checked", tone: "muted" },
};
export const checkLabel = (status: string) => CHECK[status]?.label ?? "Not checked";
export const checkTone = (status: string): Tone => CHECK[status]?.tone ?? "muted";
export const failsCheck = (status: string) => status === "incorrect" || status === "needs_approval";

/** One word for a whole deal, from what the database decided for each line. */
export function checkSummary(lines: { check_status: string }[]): { label: string; tone: Tone } {
  if (lines.length === 0) return { label: "No agents", tone: "muted" };
  const skipped = { label: "Not checked", tone: "muted" as Tone };
  for (const status of ["incorrect", "needs_approval", "overridden", "correct"]) {
    if (lines.some((line) => line.check_status === status)) return CHECK[status] ?? skipped;
  }
  return skipped;
}

// ------------------------------------------------------------------ dates --

const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const weekdayName = (n: number) => WEEKDAYS[n] ?? "";

const atNoon = (iso: string) => new Date(`${iso}T12:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
/** 1 = Monday ... 7 = Sunday, the way the brokerage settings store it. */
export const isoWeekday = (iso: string) => atNoon(iso).getUTCDay() || 7;
export function addDays(iso: string, days: number) {
  const date = atNoon(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** The next payroll dates on or after a day, from the brokerage's payroll weekdays. */
export function upcomingPayDates(weekdays: number[] | null | undefined, fromIso: string, count: number): string[] {
  const days = (weekdays ?? []).filter((d) => d >= 1 && d <= 7);
  if (days.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < 370 && out.length < count; i += 1) {
    const candidate = addDays(fromIso, i);
    if (days.includes(isoWeekday(candidate))) out.push(candidate);
  }
  return out;
}

/** "Thu 19 Nov 2026" */
export function weekDay(iso: string | null | undefined) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "–";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(atNoon(iso)).replace(",", "");
}

/** "08:30:00" -> "8:30 am" */
export function clock(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!match) return "–";
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "am" : "pm"}`;
}

/**
 * The day agents must have their documents in for a payroll: two working
 * days before it (Tuesday for a Thursday payroll, Thursday for a Monday one).
 */
export function documentDeadline(payDate: string) {
  let day = payDate;
  let left = 2;
  while (left > 0) {
    day = addDays(day, -1);
    if (isoWeekday(day) <= 5) left -= 1;
  }
  return day;
}

/** The payroll an unfinished deal is aiming for: the first payroll day whose document deadline has not passed. */
export function targetPayroll(weekdays: number[] | null | undefined, today: string) {
  const dates = upcomingPayDates(weekdays, today, 6);
  const payDate = dates.find((d) => documentDeadline(d) >= today) ?? dates[0] ?? null;
  return payDate ? { payDate, deadline: documentDeadline(payDate) } : null;
}

// ------------------------------------------------------------------ money --

/** Round to cents. Used on money typed into forms before it is sent. */
export const toCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type ScratchLine = { share: number; split: number };
/**
 * The database's rule, for the calculator scratchpad only:
 * net = GCI - all fees (never below 0); payout = round(net x share% x split%, 2);
 * company dollar = net - payouts. Whole cents and exact arithmetic throughout.
 */
export function scratchCalc(gci: number, fees: number[], lines: ScratchLine[]) {
  const cents = (value: number) => BigInt(Math.round(((Number.isFinite(value) ? Math.max(value, 0) : 0) + Number.EPSILON) * 100));
  const hundredths = (value: number) => BigInt(Math.round(((Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0) + Number.EPSILON) * 100));
  const feeTotal = fees.reduce((sum, fee) => sum + cents(fee), BigInt(0));
  const gross = cents(gci);
  const net = gross > feeTotal ? gross - feeTotal : BigInt(0);
  const scale = BigInt(100000000);
  const payouts = lines.map((line) => {
    const raw = net * hundredths(line.share) * hundredths(line.split);
    const whole = raw / scale;
    return (raw % scale) * BigInt(2) >= scale ? whole + BigInt(1) : whole;
  });
  const paid = payouts.reduce((sum, p) => sum + p, BigInt(0));
  const back = (value: bigint) => Number(value) / 100;
  return { fees: back(feeTotal), net: back(net), payouts: payouts.map(back), paid: back(paid), companyDollar: back(net - paid) };
}

// --------------------------------------------------------------- database --

/** Run an `in (...)` query in batches so a long list of ids never makes an over-long request. */
export async function inBatches<T>(ids: string[], fetchBatch: (batch: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const unique = [...new Set(ids)];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    const { data } = await fetchBatch(unique.slice(i, i + 100));
    if (data) out.push(...data);
  }
  return out;
}

export function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/** Makes typed text safe to place inside a search filter: anything that is not plain text becomes a wildcard. */
export function searchPattern(query: string) {
  const clean = query.trim().slice(0, 80).replace(/[,()"\\%*:]+/g, "*");
  return clean.replace(/^\*+|\*+$/g, "") ? `*${clean}*` : null;
}

// ------------------------------------------------------------ agent email --

/** The exact urgent-action email for a deal with documents missing. */
export function urgentEmail(input: {
  /** The system the brokerage keeps deal files in, if it named one. */
  system?: string;
  agentFirstNames: string[];
  address: string;
  missing: string[];
  payDate: string | null;
  deadline: string | null;
  brokerage: string;
}) {
  const names = input.agentFirstNames.length ? input.agentFirstNames.join(" and ") : "there";
  const subject = `Action needed: ${input.address}`;
  const lines = [
    `Hi ${names},`,
    "",
    `We cannot put ${input.address} into payroll yet. We are still missing:`,
    "",
    ...input.missing.map((item) => `  - ${item}`),
    "",
    input.payDate && input.deadline
      ? `To be paid in the ${weekDay(input.payDate)} payroll, please ${input.system ? `upload these to ${input.system}` : "send these in"} by the end of ${weekDay(input.deadline)}. Anything that arrives later moves to the following payroll.`
      : `Please ${input.system ? `upload these to ${input.system}` : "send these in"} as soon as you can so the deal can go into the next payroll.`,
    "",
    "Reply to this email if anything is unclear. Your reply is filed on the deal.",
    "",
    "Thank you,",
    `${input.brokerage} Finance`,
  ];
  return { subject, body: lines.join("\n") };
}
