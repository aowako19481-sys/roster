import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashToken } from "@/lib/invite-token";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Checking a licence against the record a state publishes itself. Kinu asks
 * the state's open-data service about one licence number at a time, and only
 * for agents a brokerage has invited. It keeps the name, type, status and
 * expiry it was told, where that came from, and when.
 *
 * Finding a record is not the same as being cleared: the licence must be in
 * good standing, not expired, and in the same name. Anything else goes to a
 * person. State data can lag by a few days, so a difference is a question for
 * a person, never a rejection.
 */
export type StateRecord = { number: string; name: string; type: string; status: string; goodStanding: boolean; expires: string | null; sponsor: string | null; updated: string | null };
type Source = { state: string; label: string; refresh: string; regulator: string; find: (number: string) => Promise<StateRecord[] | null> };

async function ask(url: string): Promise<Record<string, string>[] | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) ? (rows as Record<string, string>[]) : null;
  } catch {
    return null;   // the state's service did not answer: nothing is concluded
  }
}
const isoDate = (value: string | undefined): string | null => {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
  return us ? `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}` : null;
};

// The states' own open-data addresses. Only our tests point these somewhere else.
const NY_URL = (process.env.KINU_NY_LICENCE_URL ?? "").trim() || "https://data.ny.gov/resource/yg7h-zjbf.json";
const TX_URL = (process.env.KINU_TX_LICENCE_URL ?? "").trim() || "https://data.texas.gov/resource/s7ft-44qi.json";

export const STATE_SOURCES: Record<string, Source> = {
  NY: {
    state: "NY", label: "New York Department of State, open data (active licences)", refresh: "updated daily", regulator: "the New York Department of State, Division of Licensing Services",
    // This list holds active licences only, so being on it is the good-standing signal.
    find: async (number) => {
      const rows = await ask(`${NY_URL}?license_number=${encodeURIComponent(number)}&$limit=5`);
      return rows && rows.map((row) => ({
        number: row.license_number ?? number, name: row.license_holder_name ?? "", type: row.license_type ?? "", status: "Active", goodStanding: true,
        expires: isoDate(row.license_expiration_date), sponsor: row.business_name ?? null, updated: null,
      }));
    },
  },
  TX: {
    state: "TX", label: "Texas Real Estate Commission, open data", refresh: "updated daily", regulator: "the Texas Real Estate Commission",
    find: async (number) => {
      const digits = number.replace(/[^0-9]/g, "");
      if (digits.length < 4) return [];
      const rows = await ask(`${TX_URL}?$where=${encodeURIComponent(`starts_with(license_number,'${digits}-')`)}&$limit=5`);
      return rows && rows.map((row) => ({
        number: row.license_number ?? number, name: row.full_name ?? "", type: row.license_type ?? "", status: row.status || "Unknown", goodStanding: row.status === "Active",
        expires: isoDate(row.license_expiration_date), sponsor: row.related_license_full_name || null, updated: isoDate(row.updated),
      }));
    },
  },
};
export const supportedState = (state: string | null | undefined) => (state ? STATE_SOURCES[state.toUpperCase()] ?? null : null);

const SUFFIXES = new Set(["JR", "SR", "II", "III", "IV", "V"]);
const parts = (name: string) => name.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((part) => part.length > 1 && !SUFFIXES.has(part));
/** The same person? Their first and last name must both be on the state record, in any order. Middle names and initials are ignored. */
export function sameLicenceName(ours: string, theirs: string): boolean {
  const mine = parts(ours), state = new Set(parts(theirs));
  if (mine.length < 2 || state.size < 2) return false;
  return state.has(mine[0]!) && state.has(mine[mine.length - 1]!);
}

export type Assessment = { verdict: "verified" | "review"; reasons: string[]; record: StateRecord | null };
/** Status and match, judged separately. Every reason a person needs is listed in plain words. */
export function assess(input: { names: string[]; expires: string | null; today: string }, records: StateRecord[]): Assessment {
  if (!records.length) return { verdict: "review", reasons: ["No licence with this number is on the state’s published list. It may be mistyped, inactive, or too recent to show yet."], record: null };
  const record = records.find((row) => input.names.some((name) => sameLicenceName(name, row.name))) ?? records[0]!;
  const reasons: string[] = [];
  if (!input.names.some((name) => sameLicenceName(name, record.name))) reasons.push(`The name on the state record is “${record.name}”.`);
  if (!record.goodStanding) reasons.push(`The state lists this licence as “${record.status}”, not active.`);
  if (!record.expires) reasons.push("The state record shows no expiry date.");
  else if (record.expires < input.today) reasons.push(`The state record shows it expired on ${record.expires}.`);
  return { verdict: reasons.length ? "review" : "verified", reasons, record };
}

type Db = SupabaseClient;
const fingerprint = (assessment: Assessment) => JSON.stringify([assessment.verdict, assessment.reasons, assessment.record && [assessment.record.name, assessment.record.status, assessment.record.expires, assessment.record.type]]);

/**
 * Check one agent's licence against their state's record and write down the
 * result. Returns what happened in a word. Only ever called by our server.
 */
export async function checkLicence(db: Db, agentId: string, force = false): Promise<"verified" | "matched" | "review" | "unchanged" | "unsupported" | "unreachable" | "nothing"> {
  const { data: agent } = await db.from("agents").select("id, workspace_id, full_name, status, licence_number, licence_state, licence_expires_on, licence_status, licence_record").eq("id", agentId).maybeSingle();
  if (!agent || agent.status === "exited" || !agent.licence_number) return "nothing";
  const source = supportedState(agent.licence_state as string | null);
  if (!source) return "unsupported";
  const records = await source.find(String(agent.licence_number).toUpperCase().replace(/[^0-9A-Z-]/g, ""));
  if (records === null) return "unreachable";
  const [{ data: tax }, { data: rules }] = await Promise.all([
    db.from("agent_tax").select("legal_name").eq("agent_id", agentId).maybeSingle(),
    db.from("automation").select("auto_confirm_licence").eq("workspace_id", agent.workspace_id).maybeSingle(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const assessment = assess({ names: [agent.full_name as string, (tax?.legal_name as string | null) ?? ""].filter(Boolean), expires: agent.licence_expires_on as string | null, today }, records);
  const print = fingerprint(assessment);
  // The same answer as last time changes nothing, so a person's own decision is not overturned by a repeat.
  if (!force && (agent.licence_record as { print?: string } | null)?.print === print && agent.licence_status !== "submitted") {
    await db.rpc("system_licence_result", { agent: agentId, verdict: "same", record: null, note: null, source: source.label });
    return "unchanged";
  }
  const autoConfirm = (rules?.auto_confirm_licence as boolean | undefined) ?? true;
  const verdict = assessment.verdict === "verified" ? (autoConfirm ? "verified" : "matched") : "review";
  const record = assessment.record
    ? { name: assessment.record.name, type: assessment.record.type, status: assessment.record.status, expires: assessment.record.expires, sponsor: assessment.record.sponsor, state: source.state, source: source.label, refresh: source.refresh, regulator: source.regulator, checked: today, reasons: assessment.reasons, print }
    : { state: source.state, source: source.label, refresh: source.refresh, regulator: source.regulator, checked: today, reasons: assessment.reasons, print, found: false };
  const { error } = await db.rpc("system_licence_result", { agent: agentId, verdict, record, note: assessment.reasons.join(" ") || null, source: `${source.label}, ${source.refresh}` });
  return error ? "nothing" : verdict;
}

/** Straight after an agent enters their licence from their private link. Never holds them up: any problem is left for the daily check. */
export async function checkLicenceForLink(token: string): Promise<void> {
  try {
    const db = createAdminClient();
    if (!db) return;
    const { data } = await db.from("agents").select("id").eq("invite_token_hash", hashToken(token)).maybeSingle();
    if (data?.id) await checkLicence(db, data.id as string, true);
  } catch { /* the daily check will pick it up */ }
}

/** The daily round: new submissions first, then every licence at least once a week, so a lapse or suspension is noticed. */
export async function refreshLicences(db: Db, limit = 120): Promise<{ checked: number; flagged: number; confirmed: number }> {
  const out = { checked: 0, flagged: 0, confirmed: 0 };
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await db.from("agents").select("id, licence_record_at").in("licence_state", Object.keys(STATE_SOURCES)).not("licence_number", "is", null).neq("status", "exited")
    .or(`licence_record_at.is.null,licence_record_at.lt.${weekAgo}`).order("licence_record_at", { ascending: true, nullsFirst: true }).limit(limit);
  for (const agent of data ?? []) {
    const result = await checkLicence(db, agent.id as string);
    if (result === "unreachable") break;   // the state's service is down: try again tomorrow
    out.checked += 1;
    if (result === "review") out.flagged += 1;
    if (result === "verified") out.confirmed += 1;
  }
  return out;
}
