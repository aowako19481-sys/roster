import "server-only";
import { headers } from "next/headers";
import type { Tone } from "@/components/ui";
import { titleCase } from "@/lib/format";

// Shared helpers for the Ops pages (agents, teams, riders, files, reports,
// inviting). Nothing here decides who may do what: the database does.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A search parameter can arrive once, several times or not at all. */
export function one(value: string | string[] | undefined, max = 120): string {
  const first = Array.isArray(value) ? value[0] : value;
  return (first ?? "").trim().slice(0, max);
}

/** Case-insensitive "does any of these contain the search text". */
export function matches(query: string, ...fields: (string | null | undefined)[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => (field ?? "").toLowerCase().includes(q));
}

export function withQuery(path: string, params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

// ------------------------------------------------------------ status words --

type Word = { label: string; tone: Tone };
const WORDS: Record<string, Record<string, Word>> = {
  agent: {
    invited: { label: "Invited", tone: "muted" },
    onboarding: { label: "Onboarding", tone: "warn" },
    active: { label: "Active", tone: "ok" },
    flagged: { label: "Flagged", tone: "bad" },
    exited: { label: "Exited", tone: "muted" },
  },
  licence: {
    verified: { label: "Verified", tone: "ok" },
    submitted: { label: "Waiting for check", tone: "warn" },
    mismatch: { label: "Mismatch", tone: "bad" },
    expiring: { label: "Expiring", tone: "warn" },
    not_uploaded: { label: "Not uploaded", tone: "muted" },
  },
  w9: {
    received: { label: "Received", tone: "ok" },
    pending: { label: "Pending", tone: "muted" },
    name_mismatch: { label: "Name mismatch", tone: "bad" },
  },
  rider: {
    signed: { label: "Signed", tone: "ok" },
    sent: { label: "Sent, not signed", tone: "warn" },
    not_sent: { label: "Not sent", tone: "muted" },
    draft: { label: "Draft", tone: "muted" },
    superseded: { label: "Superseded", tone: "muted" },
    void: { label: "Void", tone: "muted" },
  },
  tier: {
    waiting: { label: "Waiting", tone: "warn" },
    held: { label: "Held for review", tone: "bad" },
    approved: { label: "Approved", tone: "ok" },
  },
  document: {
    on_file: { label: "On file", tone: "ok" },
    signed: { label: "Signed", tone: "ok" },
    check: { label: "Needs a check", tone: "warn" },
  },
  deal: {
    open: { label: "Open", tone: "plain" },
    cleared: { label: "Cleared", tone: "ok" },
    held: { label: "Held", tone: "bad" },
    processed: { label: "In payroll", tone: "dark" },
    closed: { label: "Closed", tone: "muted" },
  },
};
export type WordKind = "agent" | "licence" | "w9" | "rider" | "tier" | "document" | "deal";

/** The word (and supporting tone) for a stored status. Unknown values are shown as they are. */
export function statusWord(kind: WordKind, value: string | null | undefined): Word {
  if (!value) return { label: "–", tone: "muted" };
  return WORDS[kind]?.[value] ?? { label: titleCase(value), tone: "plain" };
}

// ------------------------------------------------------------------- files --

export const DOC_KINDS = [
  { kind: "licence", label: "Licences", one: "Licence" },
  { kind: "w9", label: "W-9 forms", one: "W-9 form" },
  { kind: "rider", label: "Signed riders", one: "Signed rider" },
  { kind: "agreement", label: "Contractor agreements", one: "Contractor agreement" },
  { kind: "audit_export", label: "Audit exports", one: "Audit export" },
  { kind: "payment_proof", label: "Payment proofs", one: "Payment proof" },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]["kind"];

export function docKind(value: string | null | undefined) {
  return DOC_KINDS.find((entry) => entry.kind === value) ?? null;
}

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** What the first bytes of a file say it is, whatever the browser claimed. */
export function sniffType(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((byte, i) => bytes[i] === byte);
  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

/** A filename reduced to letters, digits, dot and dash. Never used as it arrived. */
export function safeFilename(name: string, extension: string) {
  const base = name
    .normalize("NFKD")
    .replace(/\.[^.]*$/, "")
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80);
  return `${base || "file"}.${extension}`;
}

// --------------------------------------------------------------------- CSV --

/** One CSV cell: quoted, and never something a spreadsheet would run as a formula. */
export function csvCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(head: string[], rows: (string | number | null | undefined)[][]) {
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, csv: string) {
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(filename, "csv")}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ----------------------------------------------------------------- inviting --

/** Where this request came from, e.g. https://kinu.example, for building private links. */
export async function requestOrigin() {
  const list = await headers();
  const origin = list.get("origin");
  if (origin && /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(origin)) return origin;
  const host = list.get("host") ?? "";
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return "";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/i.test(host);
  const proto = list.get("x-forwarded-proto") === "http" || local ? "http" : "https";
  return `${proto}://${host}`;
}

export type InviteLine = { line: number; name: string; email: string; split: number; officeId: string; office: string };
export const INVITE_MAX_LINES = 200;

/**
 * Reads the pasted list: one agent per line as "Name, email, split %, office".
 * Tabs work too, so a paste from a spreadsheet needs no editing.
 */
export function parseInviteLines(pasted: string, offices: { id: string; name: string }[]) {
  const rows: InviteLine[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const officeNames = offices.map((office) => office.name).join(", ");
  const lines = pasted.split(/\r?\n/);
  let used = 0;

  lines.forEach((raw, index) => {
    if (!raw.trim()) return;
    const n = index + 1;
    used += 1;
    if (used > INVITE_MAX_LINES) {
      if (used === INVITE_MAX_LINES + 1) problems.push(`Line ${n}: only ${INVITE_MAX_LINES} agents can be invited at a time.`);
      return;
    }
    const parts = (raw.includes("\t") ? raw.split("\t") : raw.split(",")).map((part) => part.trim());
    // A spreadsheet's header row is skipped rather than reported.
    if (used === 1 && /^name$/i.test(parts[0] ?? "") && /e-?mail/i.test(parts[1] ?? "")) return;
    if (parts.length !== 4) {
      problems.push(`Line ${n}: expected 4 parts (name, email, split %, office) but found ${parts.length}.`);
      return;
    }
    const [name, emailRaw, splitRaw, officeRaw] = parts;
    const email = emailRaw.toLowerCase();
    const split = Number(splitRaw.replace(/%/g, "").trim());
    const office = offices.find((entry) => entry.name.toLowerCase() === officeRaw.toLowerCase());
    if (name.length < 2 || name.length > 120) return void problems.push(`Line ${n}: the name is missing or too long.`);
    if (!EMAIL_RE.test(email) || email.length > 254) return void problems.push(`Line ${n}: “${emailRaw.slice(0, 60)}” is not an email address.`);
    if (seen.has(email)) return void problems.push(`Line ${n}: ${email} appears twice in this list.`);
    if (splitRaw.replace(/%/g, "").trim() === "" || !Number.isFinite(split) || split < 0 || split > 100) {
      return void problems.push(`Line ${n}: the split must be a number from 0 to 100.`);
    }
    if (!office) {
      return void problems.push(`Line ${n}: there is no office called “${officeRaw.slice(0, 60)}”. Offices: ${officeNames || "none set up yet"}.`);
    }
    seen.add(email);
    rows.push({ line: n, name, email, split: Math.round(split * 100) / 100, officeId: office.id, office: office.name });
  });
  if (!rows.length && !problems.length) problems.push("Add at least one agent.");
  return { rows, problems };
}

// ------------------------------------------------------------------ riders --

export type Tier = { from: number; to: number | null; pct: number };

export function readTiers(value: unknown): Tier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tier) => {
      const t = (tier ?? {}) as Record<string, unknown>;
      return { from: Number(t.from), to: t.to === null || t.to === undefined ? null : Number(t.to), pct: Number(t.pct) };
    })
    .filter((tier) => Number.isFinite(tier.from) && Number.isFinite(tier.pct) && (tier.to === null || Number.isFinite(tier.to)));
}

/** Tiers as editable text: one per line, "from, to, pct" (leave "to" empty for the top tier). */
export function tiersToText(tiers: Tier[]) {
  return tiers.map((tier) => `${tier.from}, ${tier.to ?? ""}, ${tier.pct}`).join("\n");
}

export function parseTiers(textValue: string): { tiers: Tier[] } | { problem: string } {
  const tiers: Tier[] = [];
  const lines = textValue.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > 12) return { problem: "A rider can have at most 12 tiers." };
  for (const [index, line] of lines.entries()) {
    const parts = line.split(",").map((part) => part.replace(/[$%\s]/g, ""));
    if (parts.length !== 3) return { problem: `Tier ${index + 1}: write it as “from, to, percent”.` };
    const from = Number(parts[0]);
    const to = parts[1] === "" ? null : Number(parts[1]);
    const pct = Number(parts[2]);
    if (parts[0] === "" || !Number.isFinite(from) || from < 0) return { problem: `Tier ${index + 1}: “from” must be an amount.` };
    if (to !== null && (!Number.isFinite(to) || to <= from)) return { problem: `Tier ${index + 1}: “to” must be more than “from”, or empty.` };
    if (parts[2] === "" || !Number.isFinite(pct) || pct < 0 || pct > 100) return { problem: `Tier ${index + 1}: the percent must be from 0 to 100.` };
    tiers.push({ from, to, pct });
  }
  return { tiers };
}

/** Never more than the last four digits of a tax number. */
export function maskTin(last4: string | null | undefined) {
  return last4 && /^\d{4}$/.test(last4) ? `••• •• ${last4}` : "Not on file";
}

// ------------------------------------------------------------------- teams --

export type TreeNode<T> = { item: T; children: TreeNode<T>[] };

/**
 * Turns "who reports to whom" rows into a nested tree of any depth. Anyone
 * whose parent is missing (or who would form a loop) is placed at the top.
 */
export function buildTree<T extends { agent_id: string; parent_agent_id: string | null }>(members: T[], leadId: string | null) {
  const nodes = new Map<string, TreeNode<T>>(members.map((member) => [member.agent_id, { item: member, children: [] }]));
  const loops = (member: T) => {
    const seen = new Set<string>([member.agent_id]);
    let parent = member.parent_agent_id;
    while (parent && nodes.has(parent)) {
      if (seen.has(parent)) return true;
      seen.add(parent);
      parent = nodes.get(parent)!.item.parent_agent_id;
    }
    return false;
  };
  const roots: TreeNode<T>[] = [];
  for (const member of members) {
    const node = nodes.get(member.agent_id)!;
    const parent = member.parent_agent_id ? nodes.get(member.parent_agent_id) : undefined;
    if (!parent || member.agent_id === leadId || loops(member)) roots.push(node);
    else parent.children.push(node);
  }
  roots.sort((a, b) => Number(b.item.agent_id === leadId) - Number(a.item.agent_id === leadId));
  return roots;
}

// ------------------------------------------------------------------- dates --

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000);
}

export function addDays(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** "2026-11" → "Nov 2026" */
export function cohortLabel(cohort: string | null | undefined) {
  if (!cohort || !/^\d{4}-\d{2}$/.test(cohort)) return cohort || "Earlier";
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${cohort}-01T12:00:00Z`));
}

// ------------------------------------------------------------------- audit --

const AUDIT_VERBS: Record<string, string> = { insert: "Added", update: "Changed", delete: "Removed" };
const AUDIT_THINGS: Record<string, string> = {
  agents: "agent record", riders: "rider", teams: "team", team_members: "team member", documents: "file",
  agent_tax: "W-9 details", tier_approvals: "tier approval", licence: "licence", tier: "tier",
};

/** A readable line for an audit entry that has no summary of its own. Field names only, never values. */
export function auditText(row: { action: string; entity: string; summary: string | null; detail: unknown }) {
  if (row.summary) return row.summary;
  const thing = AUDIT_THINGS[row.entity] ?? titleCase(row.entity).toLowerCase();
  if (row.action === "update" && row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)) {
    const fields = Object.keys(row.detail).map((key) => key.replace(/_/g, " ")).slice(0, 6);
    if (fields.length) return `Changed ${fields.join(", ")} on the ${thing}`;
  }
  return `${AUDIT_VERBS[row.action] ?? titleCase(row.action)} ${thing}`;
}
