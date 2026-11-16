import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { riskScore, suggestedOpener, type DealActivity, type RetentionAgent } from "@/lib/admin-pages";
import { documentReference, riderReference } from "@/lib/automation";
import { SITE_URL } from "@/lib/company";
import { documensoReady, envelopeState, remind } from "@/lib/documenso";
import { newInviteToken, portalLink } from "@/lib/invite-token";
import { mailReady, sendLetter } from "@/lib/mail";
import { settleDocuments, settleRiders } from "@/lib/sign-settle";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What Kinu does when nobody is signed in. It runs from our own server on a
 * daily timer (and when the signing service calls in), with the server's key,
 * so every step is limited in code: it reads results back from the signing
 * service itself, sends reminders to people a brokerage already invited, and
 * emails summaries to that brokerage's own admins. It never moves money,
 * approves anything or changes a split.
 */
type Db = SupabaseClient;
type Flags = { chase_signatures: boolean; nudge_onboarding: boolean; licence_reminders: boolean; weekly_summary: boolean };
type Workspace = { id: string; name: string; timezone: string | null; addons: string[] | null; has_finance: boolean; status: string | null };
const DEFAULTS: Flags = { chase_signatures: true, nudge_onboarding: true, licence_reminders: true, weekly_summary: true };
const DAY = 86_400_000;
const MAX_REMINDERS = 3;
export type Report = Record<string, number>;

/** Collect finished signatures everywhere. Called by the timer and whenever the signing service says something changed. */
export async function collectSignatures(db: Db, ws: string | null): Promise<Report> {
  if (!documensoReady()) return { ridersSigned: 0, documentsSigned: 0 };
  const [riders, documents] = [await settleRiders(db, ws, 150), await settleDocuments(db, ws, 150)];
  return { ridersSigned: riders.signed, documentsSigned: documents.signed, couldNotCheck: riders.trouble + documents.trouble };
}

async function chase(db: Db, on: (ws: string) => boolean, now: number): Promise<number> {
  if (!documensoReady()) return 0;
  let sent = 0;
  const due = (row: { sent_at: string; last_reminded_at: string | null; reminders_sent: number }) =>
    row.reminders_sent < MAX_REMINDERS && now - Date.parse(row.sent_at) >= 2 * DAY && (!row.last_reminded_at || now - Date.parse(row.last_reminded_at) >= 3 * DAY);
  const { data: riders } = await db.from("sign_requests").select("id, workspace_id, rider_id, agent_id, envelope_id, sent_at, last_reminded_at, reminders_sent").in("status", ["sent", "opened"]).limit(300);
  for (const row of riders ?? []) {
    if (!on(row.workspace_id as string) || !due(row as never)) continue;
    try {
      const state = await envelopeState(row.envelope_id as string, riderReference(row.workspace_id as string, row.rider_id as string, row.agent_id as string));
      if (!state.waiting.length) continue;
      await remind(row.envelope_id as string, state.waiting);
      await db.from("sign_requests").update({ reminders_sent: (row.reminders_sent as number) + 1, last_reminded_at: new Date(now).toISOString() }).eq("id", row.id);
      sent += 1;
    } catch { /* tomorrow */ }
  }
  const { data: documents } = await db.from("sign_documents").select("id, workspace_id, envelope_id, sent_at, last_reminded_at, reminders_sent").in("status", ["sent", "opened"]).limit(300);
  for (const row of documents ?? []) {
    if (!on(row.workspace_id as string) || !due(row as never)) continue;
    try {
      const state = await envelopeState(row.envelope_id as string, documentReference(row.workspace_id as string));
      if (!state.waiting.length) continue;
      await remind(row.envelope_id as string, state.waiting);
      await db.from("sign_documents").update({ reminders_sent: (row.reminders_sent as number) + 1, last_reminded_at: new Date(now).toISOString() }).eq("id", row.id);
      sent += 1;
    } catch { /* tomorrow */ }
  }
  return sent;
}

/** Agents who were invited and have not finished: a fresh private link by email, on days 2, 5 and 9 at most. */
async function nudge(db: Db, workspaces: Map<string, Workspace>, on: (ws: string) => boolean, now: number): Promise<number> {
  if (!mailReady()) return 0;
  let sent = 0;
  const { data } = await db.from("agents").select("id, workspace_id, full_name, email, invite_sent_at, nudges_sent, last_nudged_at")
    .neq("onboarding_status", "ready").neq("status", "exited").not("email", "is", null).not("invite_sent_at", "is", null).lt("nudges_sent", MAX_REMINDERS).limit(500);
  for (const agent of data ?? []) {
    const ws = workspaces.get(agent.workspace_id as string);
    if (!ws || !on(ws.id)) continue;
    const since = now - Date.parse(agent.invite_sent_at as string);
    const gap = [2, 5, 9][agent.nudges_sent as number] ?? 99;
    if (since < gap * DAY || (agent.last_nudged_at && now - Date.parse(agent.last_nudged_at as string) < 2 * DAY)) continue;
    const { token, hash } = newInviteToken();
    const { data: ok, error } = await db.rpc("system_reissue_invite", { agent: agent.id, token_hash: hash });
    if (error || ok !== true) continue;
    const first = (agent.full_name as string).split(" ")[0] ?? "there";
    if (await sendLetter({
      to: agent.email as string, from: ws.name, subject: `${ws.name}: finish joining in about ten minutes`,
      heading: `${first}, you are nearly set up.`,
      lines: [`${ws.name} is waiting on a few details from you: your licence, your tax form and a signature or two.`, "It takes about ten minutes on your phone. This is your private link. It replaces any earlier one and works for 14 days."],
      button: { label: "Finish setting up", url: portalLink(SITE_URL, token) },
    })) sent += 1;
  }
  return sent;
}

/** A notice to the agent 90, 60 and 30 days before their licence runs out. */
async function licences(db: Db, workspaces: Map<string, Workspace>, on: (ws: string) => boolean, now: number): Promise<number> {
  if (!mailReady()) return 0;
  let sent = 0;
  const today = new Date(now).toISOString().slice(0, 10), limit = new Date(now + 90 * DAY).toISOString().slice(0, 10);
  const { data } = await db.from("agents").select("id, workspace_id, full_name, email, licence_expires_on, licence_reminded_days")
    .neq("status", "exited").not("email", "is", null).gte("licence_expires_on", today).lte("licence_expires_on", limit).limit(1000);
  for (const agent of data ?? []) {
    const ws = workspaces.get(agent.workspace_id as string);
    if (!ws || !on(ws.id)) continue;
    const days = Math.round((Date.parse(`${agent.licence_expires_on}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY);
    const mark = days <= 30 ? 30 : days <= 60 ? 60 : 90;
    const last = agent.licence_reminded_days as number | null;
    if (last !== null && last <= mark) continue;   // this notice (or a later one) has already gone
    const first = (agent.full_name as string).split(" ")[0] ?? "there";
    const when = new Date(`${agent.licence_expires_on}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    if (!(await sendLetter({
      to: agent.email as string, from: ws.name, subject: `Your real estate licence expires on ${when}`,
      heading: `${first}, your licence expires in ${days} day${days === 1 ? "" : "s"}.`,
      lines: [`The licence ${ws.name} has on file for you runs out on ${when}.`, `Please renew it with your state, then send ${ws.name} the new expiry date and a photo of the renewed licence so your record stays current.`],
    }))) continue;
    await db.rpc("system_licence_reminded", { agent: agent.id, days: mark });
    sent += 1;
  }
  return sent;
}

/** Monday: what needs a person this week, to each brokerage's admins. Counts and first names only. */
async function summaries(db: Db, workspaces: Map<string, Workspace>, on: (ws: string) => boolean, now: number): Promise<number> {
  if (!mailReady()) return 0;
  let sent = 0;
  for (const ws of workspaces.values()) {
    if (!on(ws.id)) continue;
    const local = new Date(new Date(now).toLocaleString("en-US", { timeZone: ws.timezone || "America/New_York" }));
    if (local.getDay() !== 1) continue;
    const today = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    const soon = new Date(Date.parse(`${today}T12:00:00Z`) + 30 * DAY).toISOString().slice(0, 10);
    const [{ data: agentRows }, riders, documents, { data: admins }] = await Promise.all([
      db.from("agents").select("id, full_name, office, status, licence_status, licence_expires_on, onboarding_status, invite_sent_at, joined_on, created_at, gci_change_pct").eq("workspace_id", ws.id).neq("status", "exited").limit(3000),
      db.from("sign_requests").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).in("status", ["sent", "opened"]),
      db.from("sign_documents").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).in("status", ["sent", "opened"]),
      db.from("workspace_members").select("email, display_name").eq("workspace_id", ws.id).eq("role", "owner_admin").eq("status", "active").limit(20),
    ]);
    const agents = (agentRows ?? []) as (RetentionAgent & { licence_expires_on: string | null; onboarding_status: string | null })[];
    if (!agents.length || !admins?.length) continue;
    const onboarding = agents.filter((agent) => agent.onboarding_status && agent.onboarding_status !== "ready").length;
    const expiring = agents.filter((agent) => agent.licence_expires_on && agent.licence_expires_on >= today && agent.licence_expires_on <= soon).length;
    const waiting = (riders.count ?? 0) + (documents.count ?? 0);
    const lines = [
      `${onboarding} agent${onboarding === 1 ? " is" : "s are"} still working through onboarding.`,
      `${waiting} document${waiting === 1 ? " is" : "s are"} out for signature.`,
      `${expiring} licence${expiring === 1 ? " expires" : "s expire"} in the next 30 days.`,
    ];
    if ((ws.addons ?? []).includes("retention")) {
      // The same scoring as the Retention page, from this brokerage's own records.
      const activity = new Map<string, DealActivity>();
      if (ws.has_finance) {
        const since = new Date(Date.parse(`${today}T12:00:00Z`) - 90 * DAY).toISOString().slice(0, 10);
        const { data: deals } = await db.from("deals").select("id, status, updated_at").eq("workspace_id", ws.id).or(`status.in.(open,held,cleared),updated_at.gte.${since}`).limit(5000);
        const byId = new Map((deals ?? []).map((deal) => [deal.id as string, deal as { status: string; updated_at: string }]));
        const { data: lines2 } = byId.size ? await db.from("deal_agents").select("deal_id, agent_id").eq("workspace_id", ws.id).limit(20000) : { data: [] };
        for (const line of lines2 ?? []) {
          const deal = byId.get(line.deal_id as string);
          if (!deal) continue;
          const entry = activity.get(line.agent_id as string) ?? { open: 0, lastActivity: null };
          if (["open", "held", "cleared"].includes(deal.status)) entry.open += 1;
          if (!entry.lastActivity || deal.updated_at > entry.lastActivity) entry.lastActivity = deal.updated_at;
          activity.set(line.agent_id as string, entry);
        }
      }
      const scored = agents.map((agent) => ({ agent, ...riskScore(agent, activity.get(agent.id) ?? null, { seeCommission: true, seeDeals: ws.has_finance, today }) }))
        .filter((row) => row.band !== "Healthy").sort((a, b) => b.score - a.score);
      lines.push(scored.length ? `${scored.length} agent${scored.length === 1 ? "" : "s"} to check in with this week:` : "Nobody is flagged to check in with this week.");
      for (const row of scored.slice(0, 5)) {
        const first = row.agent.full_name.split(" ")[0] ?? row.agent.full_name;
        lines.push(`${row.agent.full_name} (${row.band}). You could open with: “${suggestedOpener(first, row.signals)}”`);
      }
    }
    for (const admin of admins) {
      const first = String(admin.display_name ?? "").split(" ")[0];
      if (await sendLetter({
        to: admin.email as string, from: ws.name, subject: `${ws.name}: your week in Kinu`,
        heading: first ? `Good morning, ${first}.` : "Good morning.", lines,
        button: { label: "Open Kinu", url: `${SITE_URL}/sign-in` },
      })) sent += 1;
    }
  }
  return sent;
}

/** Everything the daily timer does. Returns counts only, never names. */
export async function runDaily(now = Date.now()): Promise<Report | null> {
  const db = createAdminClient();
  if (!db) return null;
  const [{ data: spaces }, { data: flagRows }] = await Promise.all([
    db.from("workspaces").select("id, name, timezone, addons, has_finance, status").limit(5000),
    db.from("automation").select("workspace_id, chase_signatures, nudge_onboarding, licence_reminders, weekly_summary").limit(5000),
  ]);
  const workspaces = new Map(((spaces ?? []) as Workspace[]).filter((ws) => (ws.status ?? "active") === "active").map((ws) => [ws.id, ws]));
  const flags = new Map((flagRows ?? []).map((row) => [row.workspace_id as string, row as unknown as Flags]));
  const on = (flag: keyof Flags) => (ws: string) => workspaces.has(ws) && (flags.get(ws) ?? DEFAULTS)[flag];
  const collected = await collectSignatures(db, null);
  return {
    ...collected,
    signatureReminders: await chase(db, on("chase_signatures"), now),
    onboardingReminders: await nudge(db, workspaces, on("nudge_onboarding"), now),
    licenceNotices: await licences(db, workspaces, on("licence_reminders"), now),
    weeklySummaries: await summaries(db, workspaces, on("weekly_summary"), now),
  };
}
