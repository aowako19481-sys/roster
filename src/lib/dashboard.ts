import "server-only";
import { createClient } from "@/lib/supabase/server";
import { initialsOf } from "@/lib/workspace";

export type Tone = "ink" | "mute" | "red" | "green";

export type Roller = {
  id: string;
  rank: number;
  name: string;
  initials: string;
  office: string;
  gci: string;
  change: string | null;
  changeUp: boolean;
};

export type CohortRow = {
  id: string;
  name: string;
  initials: string;
  team: string;
  office: string;
  licence: string;
  licenceTone: Tone;
  w9: string;
  w9Tone: Tone;
  rider: string;
  riderTone: Tone;
  status: "Ready" | "In progress" | "Flagged";
};

export type Stat = { label: string; value: number; of: number | null; note: string; noteTone: Tone };
export type Batch = { id: string; label: string; sent: number; ready: number };
export type Flag = { id: string; name: string; tag: string; detail: string };
export type Approval = {
  id: string;
  name: string;
  kind: "agent" | "team";
  reason: string;
  fromPct: number;
  toPct: number;
};

export type DashboardData = {
  cohortLabel: string;
  cohortSize: number;
  rollers: Roller[];
  stats: Stat[];
  batches: Batch[];
  totalSent: number;
  totalReady: number;
  timeline: { counts: number[]; invitedAt: string; axis: [string, string, string]; summary: string } | null;
  approvals: Approval[];
  flags: Flag[];
  rows: CohortRow[];
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const STATUS_LABEL = { ready: "Ready", in_progress: "In progress", flagged: "Flagged" } as const;
const W9_LABEL: Record<string, string> = { received: "received", pending: "pending", name_mismatch: "name mismatch" };
const RIDER_LABEL: Record<string, string> = { signed: "signed", sent: "sent", not_sent: "not sent" };

function toneOf(value: string): Tone {
  if (value === "received" || value === "signed") return "ink";
  if (value === "pending" || value === "not_sent" || value === "sent") return "mute";
  return "red";
}

function clock(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone })
    .format(date)
    .replace(/\s?(AM|PM)$/, (_, half: string) => ` ${half.toLowerCase()}`);
}

function shortClock(date: Date, timeZone: string) {
  return clock(date, timeZone).replace(/ (am|pm)$/, "");
}

function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

function batchLabel(sentAt: Date, now: Date, timeZone: string) {
  if (dayKey(sentAt, timeZone) === dayKey(now, timeZone)) return `Today · ${clock(sentAt, timeZone)}`;
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone }).formatToParts(sentAt);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("weekday")} ${pick("day")} ${pick("month")}`;
}

function cohortName(cohort: string) {
  const [year, month] = cohort.split("-").map(Number);
  if (!year || !month) return "Current";
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Everything the dashboard shows, read as the signed-in user. Row-level
 * security limits every query to the user's own workspace; the workspace
 * filter here is for correctness and speed, not for security.
 */
export async function getDashboardData(workspaceId: string, timeZone: string): Promise<DashboardData> {
  const supabase = await createClient();
  const now = new Date();

  const [topResult, latestCohort, batchResult, flagResult, approvalResult] = await Promise.all([
    supabase
      .from("agents")
      .select("id, full_name, office, gci_ytd, gci_change_pct")
      .eq("workspace_id", workspaceId)
      .gt("gci_ytd", 0)
      .order("gci_ytd", { ascending: false })
      .limit(10),
    supabase
      .from("agents")
      .select("cohort")
      .eq("workspace_id", workspaceId)
      .not("cohort", "is", null)
      .order("cohort", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("onboarding_batches")
      .select("id, sent_at, sent_count, ready_count, ready_timeline")
      .eq("workspace_id", workspaceId)
      .order("sent_at", { ascending: false })
      .limit(12),
    supabase
      .from("attention_items")
      .select("id, tag, detail, position, agents ( full_name )")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true })
      .limit(5),
    supabase
      .from("tier_approvals")
      .select("id, subject_kind, subject_name, reason, from_pct, to_pct")
      .eq("workspace_id", workspaceId)
      .eq("status", "waiting")
      .order("position", { ascending: true })
      .limit(5),
  ]);

  const cohort = latestCohort.data?.cohort ?? null;
  const cohortResult = cohort
    ? await supabase
        .from("agents")
        .select("id, full_name, office, team_label, licence_masked, licence_status, licence_note, w9_status, rider_status, onboarding_status")
        .eq("workspace_id", workspaceId)
        .eq("cohort", cohort)
        .order("cohort_position", { ascending: true })
        .limit(500)
    : { data: [] };

  const cohortAgents = cohortResult.data ?? [];
  const size = cohortAgents.length;
  const count = (test: (agent: (typeof cohortAgents)[number]) => boolean) => cohortAgents.filter(test).length;

  const verified = count((a) => a.licence_status === "verified");
  const mismatches = count((a) => a.licence_status === "mismatch");
  const w9In = count((a) => a.w9_status !== "pending");
  const w9Pending = size - w9In;
  const signed = count((a) => a.rider_status === "signed");

  const stats: Stat[] = [
    { label: "Welcome links sent", value: size, of: null, note: "all delivered", noteTone: "mute" },
    {
      label: "Licences verified",
      value: verified,
      of: size,
      note: mismatches ? `${mismatches} mismatch${mismatches === 1 ? "" : "es"}` : "no mismatches",
      noteTone: mismatches ? "red" : "mute",
    },
    { label: "W-9s received", value: w9In, of: size, note: `${w9Pending} pending`, noteTone: "mute" },
    {
      label: "Riders signed",
      value: signed,
      of: size,
      note: signed === size ? "all signed" : `${size - signed} to go`,
      noteTone: signed === size ? "green" : "mute",
    },
  ];

  const rows: CohortRow[] = cohortAgents.map((a) => ({
    id: a.id,
    name: a.full_name,
    initials: initialsOf(a.full_name),
    team: a.team_label ?? "Solo",
    office: a.office,
    licence: a.licence_status === "verified" ? (a.licence_masked ?? "on file") : (a.licence_note ?? "check needed"),
    licenceTone: a.licence_status === "verified" ? "ink" : a.licence_status === "not_uploaded" ? "mute" : "red",
    w9: W9_LABEL[a.w9_status] ?? a.w9_status,
    w9Tone: toneOf(a.w9_status),
    rider: RIDER_LABEL[a.rider_status] ?? a.rider_status,
    riderTone: toneOf(a.rider_status),
    status: STATUS_LABEL[a.onboarding_status as keyof typeof STATUS_LABEL] ?? "In progress",
  }));

  const rollers: Roller[] = (topResult.data ?? []).map((a, index) => ({
    id: a.id,
    rank: index + 1,
    name: a.full_name,
    initials: initialsOf(a.full_name),
    office: a.office,
    gci: money.format(Number(a.gci_ytd)),
    change: a.gci_change_pct === null ? null : `${Math.abs(a.gci_change_pct)}% vs Q3`,
    changeUp: (a.gci_change_pct ?? 0) >= 0,
  }));

  const allBatches = batchResult.data ?? [];
  const batches: Batch[] = allBatches.slice(0, 3).map((b) => ({
    id: b.id,
    label: batchLabel(new Date(b.sent_at), now, timeZone),
    sent: b.sent_count,
    ready: b.ready_count,
  }));

  const withTimeline = allBatches.find((b) => Array.isArray(b.ready_timeline) && b.ready_timeline.length > 0);
  let timeline: DashboardData["timeline"] = null;
  if (withTimeline?.ready_timeline) {
    const counts = withTimeline.ready_timeline as number[];
    const start = new Date(withTimeline.sent_at);
    const at = (slot: number) => new Date(start.getTime() + slot * 5 * 60_000);
    const peak = Math.max(...counts);
    const peakSlot = counts.indexOf(peak);
    timeline = {
      counts,
      invitedAt: clock(start, timeZone),
      axis: [shortClock(start, timeZone), shortClock(at(Math.floor(counts.length / 2) - 1), timeZone), shortClock(at(counts.length - 1), timeZone)],
      summary: `Agents ready per five minutes after the ${clock(start, timeZone)} invite, peaking at ${peak} around ${shortClock(at(peakSlot), timeZone)}`,
    };
  }

  const flags: Flag[] = (flagResult.data ?? []).map((f) => {
    const agent = Array.isArray(f.agents) ? f.agents[0] : f.agents;
    return { id: f.id, name: agent?.full_name ?? "Agent", tag: f.tag, detail: f.detail };
  });

  const approvals: Approval[] = (approvalResult.data ?? []).map((t) => ({
    id: t.id,
    name: t.subject_name,
    kind: t.subject_kind === "team" ? "team" : "agent",
    reason: t.reason,
    fromPct: t.from_pct,
    toPct: t.to_pct,
  }));

  return {
    cohortLabel: cohort ? `${cohortName(cohort)} cohort` : "No cohort yet",
    cohortSize: size,
    rollers,
    stats,
    batches,
    totalSent: allBatches.slice(0, 3).reduce((sum, b) => sum + b.sent_count, 0),
    totalReady: allBatches.slice(0, 3).reduce((sum, b) => sum + b.ready_count, 0),
    timeline,
    approvals,
    flags,
    rows,
  };
}
