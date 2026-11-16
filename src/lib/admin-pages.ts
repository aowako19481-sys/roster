// Shared helpers for the staff console, brokerage settings, the audit log and
// the Retention / Exit Kit add-on pages. Pure functions only: nothing here
// talks to the database or decides what anyone may do.

import { BUILT_IN_ROLES, type BuiltInRole } from "@/lib/roles";

// ------------------------------------------------------------ form readers --

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A lower-cased email from a form field, or null if it does not look like one. */
export function emailField(form: FormData, name: string): string | null {
  const raw = form.get(name);
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return value.length >= 3 && value.length <= 254 && EMAIL_PATTERN.test(value) ? value : null;
}

/** True when a checkbox with this name was ticked. */
export function ticked(form: FormData, name: string): boolean {
  const value = form.get(name);
  return value === "on" || value === "1" || value === "true";
}

/** A built-in role name from a form field, or null. */
export function roleField(form: FormData, name: string): BuiltInRole | null {
  const value = form.get(name);
  return typeof value === "string" && (BUILT_IN_ROLES as readonly string[]).includes(value) ? (value as BuiltInRole) : null;
}

/** "HH:MM" (24 hour) from a time input, or null. */
export function timeField(form: FormData, name: string): string | null {
  const value = form.get(name);
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

/** "08:30:00" from the database becomes "08:30" for a time input. */
export function timeValue(value: string | null | undefined, fallback: string): string {
  const match = /^(\d{2}):(\d{2})/.exec(value ?? "");
  return match ? `${match[1]}:${match[2]}` : fallback;
}

// ------------------------------------------------------ products and price --

export const ADDONS = [
  { key: "retention", label: "Retention Insights + Exit Kit", perAgent: 4 },
  { key: "finance_shield", label: "Finance Shield", perAgent: 1.5 },
  { key: "compliance", label: "Compliance pack", perAgent: 1.5 },
] as const;
export type AddonKey = (typeof ADDONS)[number]["key"];

/** The month-to-month price of one agent seat. Ops and Finance are both included in it. */
export const SEAT_PRICE = 15.99;
/** The monthly minimum. */
export const MONTHLY_MINIMUM = 500;

export function addonLabel(key: string): string {
  return ADDONS.find((addon) => addon.key === key)?.label ?? key;
}

/** The add-ons ticked in a form (checkboxes named addon_<key>). */
export function addonsField(form: FormData): AddonKey[] {
  return ADDONS.filter((addon) => ticked(form, `addon_${addon.key}`)).map((addon) => addon.key);
}

export type PriceLine = { label: string; perAgent: number; monthly: number };

/** Monthly estimate at the public month-to-month prices. An estimate, not an invoice. */
export function priceEstimate(ws: { hasOps: boolean; hasFinance: boolean; addons: string[] }, agents: number) {
  const lines: PriceLine[] = [];
  const add = (label: string, perAgent: number) => lines.push({ label, perAgent, monthly: Math.round(perAgent * agents * 100) / 100 });
  if (ws.hasOps || ws.hasFinance) add("Agent seat (Ops and Finance)", SEAT_PRICE);
  for (const addon of ADDONS) if (ws.addons.includes(addon.key)) add(addon.label, addon.perAgent);
  const subtotal = Math.round(lines.reduce((sum, line) => sum + line.monthly, 0) * 100) / 100;
  const perAgent = Math.round(lines.reduce((sum, line) => sum + line.perAgent, 0) * 100) / 100;
  return { lines, perAgent, subtotal, minimumApplies: subtotal < MONTHLY_MINIMUM, total: Math.max(subtotal, MONTHLY_MINIMUM) };
}

// ---------------------------------------------------------------- settings --

export const WORKSPACE_STATUSES = ["active", "paused", "closed"] as const;

export const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
] as const;

export const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
  { value: "America/Toronto", label: "Eastern (Toronto)" },
  { value: "America/Vancouver", label: "Pacific (Vancouver)" },
  { value: "Europe/London", label: "London" },
  { value: "UTC", label: "UTC" },
] as const;

/** Only time zones from the list above are accepted from a form. */
export function timezoneField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && TIMEZONES.some((zone) => zone.value === value) ? value : null;
}

/** Options for a time zone select, keeping a current value that is not in the short list. */
export function timezoneOptions(current?: string | null) {
  const options: { value: string; label: string }[] = [...TIMEZONES];
  if (current && !options.some((zone) => zone.value === current)) options.unshift({ value: current, label: current });
  return options;
}

export function settingsTabs(caps: { has(cap: "settings.manage" | "members.manage" | "audit.view"): boolean }) {
  const tabs: { href: string; label: string }[] = [];
  if (caps.has("settings.manage") || caps.has("members.manage") || caps.has("audit.view")) tabs.push({ href: "/settings", label: "General" });
  if (caps.has("members.manage")) tabs.push({ href: "/settings/people", label: "People and roles" });
  if (caps.has("audit.view")) tabs.push({ href: "/settings/audit", label: "Audit log" });
  return tabs;
}

// --------------------------------------------------------------- audit log --

export type AuditRow = {
  id: number;
  actor_label: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string | null;
  detail: unknown;
  at: string;
};

/** Every kind of record the audit log can hold, with the wording shown to people. */
export const AUDIT_ENTITIES: Record<string, string> = {
  workspaces: "Brokerage settings",
  workspace_members: "People",
  member_invites: "Invitations",
  custom_roles: "Custom roles",
  power: "Big powers",
  offices: "Offices",
  agents: "Agents",
  agent_tax: "W-9 details",
  licence: "Licence checks",
  teams: "Teams",
  team_members: "Team members",
  riders: "Riders",
  tier: "Tier decisions",
  tier_approvals: "Tier approvals",
  documents: "Files",
  deals: "Deals",
  deal_agents: "Deal splits",
  deal_fees: "Deal fees",
  deal_checklist: "Deal checklists",
  payments: "Payments",
  payment_allocations: "Payment allocations",
  payrolls: "Payrolls",
};

const ENTITY_SINGULAR: Record<string, string> = {
  workspaces: "the brokerage's settings",
  workspace_members: "a person's access",
  member_invites: "an invitation",
  custom_roles: "a custom role",
  power: "a big power",
  offices: "an office",
  agents: "an agent",
  agent_tax: "an agent's W-9 details",
  licence: "a licence",
  teams: "a team",
  team_members: "a team member",
  riders: "a rider",
  tier: "a tier move",
  tier_approvals: "a tier approval",
  documents: "a file",
  deals: "a deal",
  deal_agents: "a split on a deal",
  deal_fees: "a fee on a deal",
  deal_checklist: "a deal checklist item",
  payments: "a payment",
  payment_allocations: "a payment allocation",
  payrolls: "a payroll",
};

const ACTION_VERBS: Record<string, string> = { insert: "Added", update: "Changed", delete: "Removed" };

/** A readable line for a log entry: its own summary if it has one, otherwise built from action and entity. */
export function describeAudit(row: Pick<AuditRow, "action" | "entity" | "summary" | "detail">): string {
  if (row.summary && row.summary.trim()) return row.summary.trim();
  const verb = ACTION_VERBS[row.action] ?? row.action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const what = ENTITY_SINGULAR[row.entity] ?? row.entity.replace(/_/g, " ");
  if (row.action === "update" && row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)) {
    const fields = Object.keys(row.detail as Record<string, unknown>).map(fieldLabel);
    if (fields.length) return `${verb} ${what}: ${fields.slice(0, 4).join(", ")}${fields.length > 4 ? ` and ${fields.length - 4} more` : ""}`;
  }
  return `${verb} ${what}`;
}

export function fieldLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\bid\b/g, "ID").replace(/^\w/, (c) => c.toUpperCase());
}

// Never shown, even to someone who may read the log.
const HIDDEN_FIELDS = new Set(["invite_token_hash", "licence_number", "tin_last4", "provider_ref"]);

/** The changed fields of a log entry as label and value pairs, ready to show or export. */
export function auditFields(detail: unknown): { label: string; value: string }[] {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return [];
  return Object.entries(detail as Record<string, unknown>)
    .filter(([key]) => !HIDDEN_FIELDS.has(key))
    .map(([key, value]) => ({
      label: fieldLabel(key),
      value: value === null || value === undefined || value === "" ? "(empty)"
        : typeof value === "object" ? JSON.stringify(value).slice(0, 400)
        : String(value).slice(0, 400),
    }));
}

/** An entity filter from the address bar is only used if it is one of our fixed names. */
export function auditEntity(value: string | string[] | undefined): string | null {
  return typeof value === "string" && Object.hasOwn(AUDIT_ENTITIES, value) ? value : null;
}

/**
 * Free text from the address bar, reduced to letters, digits and a few safe
 * characters so it can be used in a filter. Anything else becomes a wildcard.
 */
export function auditSearch(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().slice(0, 60).replace(/[^A-Za-z0-9 @_-]+/g, "*").replace(/\*+/g, "*").replace(/^\*|\*$/g, "").trim();
  return clean.length >= 2 ? clean : null;
}

/** The "or" filter for a free-text search of the log. */
export function auditSearchFilter(clean: string): string {
  const like = `*${clean}*`;
  return ["summary", "actor_label", "action", "entity", "entity_id"].map((column) => `${column}.ilike.${like}`).join(",");
}

export function pageNumber(value: string | string[] | undefined): number {
  const n = typeof value === "string" && /^\d{1,5}$/.test(value) ? Number(value) : 1;
  return n >= 1 ? n : 1;
}

export const AUDIT_PAGE_SIZE = 50;

// --------------------------------------------------------------------- CSV --

/** One CSV cell: quoted, and made harmless if a spreadsheet would read it as a formula. */
export function csvCell(value: unknown): string {
  let cell = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

// --------------------------------------------------------------- retention --

export type RetentionAgent = {
  id: string;
  full_name: string;
  office: string | null;
  status: string;
  licence_status: string | null;
  licence_expires_on: string | null;
  onboarding_status: string | null;
  gci_change_pct: number | null;
  invite_sent_at: string | null;
  joined_on: string | null;
  created_at: string | null;
};

export type DealActivity = { open: number; lastActivity: string | null };

export type RiskSignal = { key: "quiet" | "drop" | "licence" | "onboarding"; label: string; points: number };

export const RISK_RULES = [
  { points: 30, text: "No open deal and nothing closed in the last 90 days (only counted when you may see deals, for agents who are active and did not join in the last 90 days)." },
  { points: 25, text: "Commission down 20% or more against last quarter (15 points if it is down between 10% and 20%)." },
  { points: 20, text: "Licence flagged as a mismatch (15 points if it is marked expiring, or expires within 60 days)." },
  { points: 15, text: "Onboarding not finished more than 14 days after the invitation went out." },
] as const;

export const RISK_BANDS = { high: 45, watch: 20 } as const;

const DAY_MS = 86_400_000;

/**
 * A simple, explainable score from 0 to 100. Signals the viewer is not
 * allowed to see (commission, deals) are passed as null and left out.
 */
export function riskScore(
  agent: RetentionAgent,
  deals: DealActivity | null,
  opts: { seeCommission: boolean; seeDeals: boolean; today: string },
): { score: number; band: "High" | "Watch" | "Healthy"; signals: RiskSignal[] } {
  const now = Date.parse(`${opts.today}T12:00:00Z`);
  const signals: RiskSignal[] = [];

  if (opts.seeDeals && (agent.status === "active" || agent.status === "flagged")) {
    const last = deals?.lastActivity ? Date.parse(deals.lastActivity) : null;
    const quiet = (deals?.open ?? 0) === 0 && (last === null || now - last > 90 * DAY_MS);
    // Someone who joined in the last 90 days has not had time to be quiet.
    const joined = Date.parse(agent.joined_on ? `${agent.joined_on}T12:00:00Z` : agent.invite_sent_at ?? "");
    const isNew = Number.isFinite(joined) && now - joined < 90 * DAY_MS;
    if (quiet && !isNew) signals.push({ key: "quiet", label: "No recent deals", points: 30 });
  }

  if (opts.seeCommission && agent.gci_change_pct !== null) {
    if (agent.gci_change_pct <= -20) signals.push({ key: "drop", label: "Commission well down on last quarter", points: 25 });
    else if (agent.gci_change_pct <= -10) signals.push({ key: "drop", label: "Commission down on last quarter", points: 15 });
  }

  const expires = agent.licence_expires_on ? Date.parse(`${agent.licence_expires_on}T12:00:00Z`) : null;
  if (agent.licence_status === "mismatch") signals.push({ key: "licence", label: "Licence flagged", points: 20 });
  else if (agent.licence_status === "expiring" || (expires !== null && expires - now < 60 * DAY_MS)) {
    signals.push({ key: "licence", label: "Licence expiring", points: 15 });
  }

  const started = Date.parse(agent.invite_sent_at ?? agent.created_at ?? "");
  if (agent.onboarding_status !== "ready" && Number.isFinite(started) && now - started > 14 * DAY_MS) {
    signals.push({ key: "onboarding", label: "Onboarding stalled", points: 15 });
  }

  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.points, 0));
  const band = score >= RISK_BANDS.high ? "High" : score >= RISK_BANDS.watch ? "Watch" : "Healthy";
  return { score, band, signals };
}

/** A way to open the conversation. On purpose, none of these mention a number. */
export function suggestedOpener(firstName: string, signals: RiskSignal[]): string {
  const top = [...signals].sort((a, b) => b.points - a.points)[0]?.key;
  switch (top) {
    case "quiet":
      return `${firstName}, I wanted to check in. What are you working on at the moment, and is there anything we could do to help you get the next one over the line?`;
    case "drop":
      return `${firstName}, how are things feeling for you this season? I would like to hear what is getting in your way and where more support from us would make a difference.`;
    case "licence":
      return `${firstName}, I noticed some paperwork on your licence still needs sorting. Can we take that off your plate together this week?`;
    case "onboarding":
      return `${firstName}, I want to make sure getting set up with us has been smooth. Is anything unclear or stuck that I can help finish?`;
    default:
      return `${firstName}, just checking in. How is everything going, and is there anything you need from us right now?`;
  }
}

export const CHECK_IN_OUTCOMES = ["Open to a split review", "Happy, no action", "Needs more leads", "Considering leaving"] as const;

// ------------------------------------------------------------- plan pieces --

/** Every piece of the plan that staff can lock or unlock for a brokerage. */
export const PLAN_PIECES = [
  { key: "ops", label: "Ops", kind: "product", perAgent: 0,
    locks: "Ops pages show as a locked preview in the navigation, and the database refuses inviting or editing agents, riders, teams and file changes for everyone in the brokerage." },
  { key: "finance", label: "Finance", kind: "product", perAgent: 0,
    locks: "Finance pages show as a locked preview in the navigation, and the database refuses deals, payments, payroll, payouts, statements and overrides for everyone in the brokerage." },
  { key: "retention", label: "Retention Insights + Exit Kit", kind: "addon", perAgent: 4,
    locks: "Retention and Exit kit show as a locked preview in the navigation and open the “not in your plan” page instead." },
  { key: "finance_shield", label: "Finance Shield", kind: "addon", perAgent: 1.5,
    locks: "Payout checks shows as a locked preview in the navigation and opens the “not in your plan” page instead." },
  { key: "compliance", label: "Compliance pack", kind: "addon", perAgent: 1.5,
    locks: "The compliance pack pages (audit files and the year-end 1099 pack) open the “not in your plan” page instead." },
] as const;
export type PlanPieceKey = (typeof PLAN_PIECES)[number]["key"];

export function planPiece(value: unknown) {
  return PLAN_PIECES.find((piece) => piece.key === value) ?? null;
}

/** Whether a brokerage has a piece switched on. */
export function pieceUnlocked(ws: { has_ops: boolean; has_finance: boolean; addons: string[] | null }, key: PlanPieceKey): boolean {
  if (key === "ops") return ws.has_ops;
  if (key === "finance") return ws.has_finance;
  return (ws.addons ?? []).includes(key);
}

// ------------------------------------------------------- account and seats --

export const PLANS = [
  { key: "standard", label: "Standard", blurb: "List price per agent" },
  { key: "team", label: "Team", blurb: "One team or small office" },
  { key: "brokerage", label: "Brokerage", blurb: "Multi-office, quoted" },
  { key: "custom", label: "Custom", blurb: "Bespoke agreement" },
] as const;
export function planLabel(key: string): string {
  return PLANS.find((plan) => plan.key === key)?.label ?? "Standard";
}

export const BILLING_LABEL: Record<string, string> = { paid: "Paid this month", invoiced: "Invoiced, not paid", none: "Nothing filed this month" };

/** The first day of a month typed as YYYY-MM, or null. */
export function monthField(form: FormData, name: string): string | null {
  const value = String(form.get(name) ?? "");
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? `${value}-01` : null;
}

export function monthLabel(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
