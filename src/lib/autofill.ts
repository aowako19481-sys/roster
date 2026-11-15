import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { day, money, titleCase } from "@/lib/format";

/**
 * Autofill documents. A manager writes a layout as plain text and marks
 * where deal information goes with {{placeholders}}. This turns that layout
 * plus one deal into a list of blocks to show or print. The layout is never
 * treated as HTML or as instructions: it is split into text and known
 * placeholders, and anything unknown is shown as written.
 */

export const TYPE_LABEL: Record<string, string> = {
  landlord: "Landlord", seller: "Seller", tenant: "Tenant", buyer: "Buyer", dual: "Dual", pass_through: "Pass-through", referral: "Referral",
};
export const METHOD_LABEL: Record<string, string> = { check: "Check", wire: "Wire", hyfin: "Hyfin" };

/** The reference shown beside the editor. */
export const PLACEHOLDERS: { group: string; items: { tag: string; means: string }[] }[] = [
  {
    group: "Filled in from the deal",
    items: [
      { tag: "{{brokerage}}", means: "Your brokerage's name" },
      { tag: "{{address}}", means: "The deal's address" },
      { tag: "{{type}}", means: "Landlord, Seller, Tenant, Buyer, Dual, Pass-through or Referral" },
      { tag: "{{pp_number}}", means: "PP number" },
      { tag: "{{deposit_date}}", means: "Deposit date" },
      { tag: "{{gci}}", means: "Gross commission" },
      { tag: "{{net}}", means: "GCI less referral and outside fees" },
      { tag: "{{total_received}}", means: "Total of payments recorded against the deal" },
      { tag: "{{company_dollar}}", means: "Net less every payout" },
      { tag: "{{agents}}", means: "Agents on the deal, as a list of names" },
      { tag: "{{parties}}", means: "Landlords, tenants, sellers and buyers, one per line" },
      { tag: "{{today}}", means: "The date the document is opened" },
    ],
  },
  {
    group: "Tables and sections (put each on a line of its own)",
    items: [
      { tag: "{{payments_table}}", means: "Payments received, with the explanation line" },
      { tag: "{{agents_table}}", means: "Agents and their share of the deal" },
      { tag: "{{payouts_table}}", means: "Agents with split and payout" },
      { tag: "{{referral_lines}}", means: "Referral fee lines (outside-brokerage fees never appear)" },
      { tag: "{{signature_lines}}", means: "Prepared by, approved by, date" },
      { tag: "{{proof_of_payment}}", means: "Where the proof of payment is placed" },
      { tag: "{{bank_receipt}}", means: "Where the bank receipt is placed" },
    ],
  },
  {
    group: "Boxes someone types into for each deal",
    items: [{ tag: "{{fill:Label}}", means: "A fill-in box with your own label, for example {{fill:Deposit slip number}}" }],
  },
  {
    group: "Layout",
    items: [
      { tag: "# Title", means: "A line starting with # is the document's title" },
      { tag: "## Heading", means: "A line starting with ## is a section heading" },
      { tag: "---", means: "A line of three dashes draws a rule" },
      { tag: "{{page_break}}", means: "Starts a new page: everything after it prints on page 2 (use it again for page 3)" },
    ],
  },
];

export type DealDocData = {
  brokerage: string;
  deal: {
    id: string; address: string; deal_type: string; gci: number; net: number; company_dollar: number;
    deposit_date: string | null; pp_number: string | null; status: string; parties: { kind: string; name: string }[];
  };
  lines: { name: string; basis: string; share_pct: number; split_pct: number; payout: number }[];
  referrals: { payee: string; amount: number }[];
  payments: { received_on: string; method: string; reference: string | null; explanation: string | null; amount: number; payment_id: string; has_proof: boolean }[];
  documents: { id: string; kind: string; filename: string; path: string | null; created_at: string }[];
};

/** Everything a document can show for one deal, read as the signed-in user. */
export async function loadDealDocData(supabase: SupabaseClient, workspaceId: string, dealId: string): Promise<DealDocData | null> {
  const [{ data: ws }, { data: deal }] = await Promise.all([
    supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    supabase.from("deals").select("id, address, deal_type, gci, net, company_dollar, deposit_date, pp_number, status, parties").eq("id", dealId).eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (!ws || !deal) return null;

  const [{ data: lines }, { data: fees }, { data: allocations }, { data: documents }] = await Promise.all([
    supabase.from("deal_agents").select("agent_id, basis, share_pct, split_pct, payout").eq("deal_id", dealId).eq("workspace_id", workspaceId).limit(50),
    supabase.from("deal_fees").select("kind, payee, amount").eq("deal_id", dealId).eq("workspace_id", workspaceId).limit(50),
    supabase.from("payment_allocations").select("payment_id, amount, explanation").eq("deal_id", dealId).eq("workspace_id", workspaceId).limit(50),
    supabase.from("documents").select("id, kind, filename, path, created_at").eq("deal_id", dealId).eq("workspace_id", workspaceId).in("kind", ["payment_proof", "bank_receipt"]).order("created_at").limit(50),
  ]);

  const agentIds = [...new Set((lines ?? []).map((line) => line.agent_id as string))];
  const paymentIds = [...new Set((allocations ?? []).map((row) => row.payment_id as string))];
  const [{ data: agents }, { data: payments }] = await Promise.all([
    agentIds.length ? supabase.from("agents").select("id, full_name").in("id", agentIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    paymentIds.length
      ? supabase.from("payments").select("id, received_on, method, reference, proof_path").in("id", paymentIds)
      : Promise.resolve({ data: [] as { id: string; received_on: string; method: string; reference: string | null; proof_path: string | null }[] }),
  ]);
  const nameOf = new Map((agents ?? []).map((agent) => [agent.id, agent.full_name]));
  const paymentOf = new Map((payments ?? []).map((payment) => [payment.id, payment]));

  return {
    brokerage: ws.name,
    deal: {
      id: deal.id, address: deal.address, deal_type: deal.deal_type, gci: Number(deal.gci), net: Number(deal.net),
      company_dollar: Number(deal.company_dollar), deposit_date: deal.deposit_date, pp_number: deal.pp_number, status: deal.status,
      parties: Array.isArray(deal.parties) ? (deal.parties as { kind: string; name: string }[]) : [],
    },
    lines: (lines ?? []).map((line) => ({
      name: nameOf.get(line.agent_id as string) ?? "Agent", basis: line.basis, share_pct: Number(line.share_pct),
      split_pct: Number(line.split_pct), payout: Number(line.payout),
    })),
    referrals: (fees ?? []).filter((fee) => fee.kind === "referral").map((fee) => ({ payee: fee.payee, amount: Number(fee.amount) })),
    payments: (allocations ?? []).map((row) => {
      const payment = paymentOf.get(row.payment_id as string);
      return {
        received_on: payment?.received_on ?? "", method: payment?.method ?? "", reference: payment?.reference ?? null,
        explanation: row.explanation ?? null, amount: Number(row.amount), payment_id: row.payment_id as string,
        has_proof: Boolean(payment?.proof_path),
      };
    }),
    documents: (documents ?? []).map((doc) => ({ id: doc.id, kind: doc.kind, filename: doc.filename, path: doc.path, created_at: doc.created_at })),
  };
}

/** A made-up deal, so a layout can be previewed before any real deal uses it. */
export function sampleDocData(brokerage: string): DealDocData {
  return {
    brokerage,
    deal: {
      id: "sample", address: "245 Example St, #4B", deal_type: "tenant", gci: 14250, net: 12825, company_dollar: 2565,
      deposit_date: "2026-11-12", pp_number: "PP-00000", status: "open",
      parties: [{ kind: "tenant", name: "Sample Tenant" }, { kind: "landlord", name: "Sample Landlord LLC" }],
    },
    lines: [{ name: "Sample Agent", basis: "individual", share_pct: 100, split_pct: 80, payout: 10260 }],
    referrals: [{ payee: "Sample Referral Co", amount: 1425 }],
    payments: [{ received_on: "2026-11-12", method: "wire", reference: "WIRE 00000", explanation: "245 Example St, #4B ($14,250.00)", amount: 14250, payment_id: "sample", has_proof: false }],
    documents: [],
  };
}

type Inline = { kind: "text"; text: string } | { kind: "fill"; label: string } | { kind: "unknown"; text: string };
export type Block =
  | { kind: "title" | "heading" | "line"; parts: Inline[] }
  | { kind: "rule" | "space" | "page_break" }
  | { kind: "payments_table" | "agents_table" | "payouts_table" | "referral_lines" | "signature_lines" | "proof_of_payment" | "bank_receipt" };

const SECTIONS = ["payments_table", "agents_table", "payouts_table", "referral_lines", "signature_lines", "proof_of_payment", "bank_receipt"] as const;
const TAG = /\{\{\s*([^{}]{1,80}?)\s*\}\}/g;

function valueOf(name: string, data: DealDocData): string | null {
  const { deal } = data;
  switch (name) {
    case "brokerage": return data.brokerage;
    case "address": return deal.address;
    case "type": return TYPE_LABEL[deal.deal_type] ?? titleCase(deal.deal_type);
    case "pp_number": return deal.pp_number ?? "–";
    case "deposit_date": return day(deal.deposit_date);
    case "gci": return money(deal.gci);
    case "net": return money(deal.net);
    case "company_dollar": return money(deal.company_dollar);
    case "total_received": return money(data.payments.reduce((sum, payment) => sum + payment.amount, 0));
    case "agents": return data.lines.map((line) => line.name).join(", ") || "–";
    case "parties": return deal.parties.map((party) => `${titleCase(party.kind)}: ${party.name}`).join("\n") || "–";
    case "today": return day(new Date());
    case "payments_list":
      return data.payments.map((p) => `${day(p.received_on)} ${METHOD_LABEL[p.method] ?? p.method}${p.reference ? ` ${p.reference}` : ""}: ${money(p.amount)}`).join("\n") || "–";
    case "payouts_list":
      return data.lines.map((line) => `${line.name}: ${line.share_pct}% of deal at ${line.split_pct}% = ${money(line.payout)}`).join("\n") || "–";
    case "referral_list": return data.referrals.map((fee) => `${fee.payee}: ${money(fee.amount)}`).join("\n") || "–";
    default: return null;
  }
}

/** What a PDF form field can be filled with. */
export const FIELD_SOURCES: { key: string; label: string }[] = [
  { key: "brokerage", label: "Brokerage name" }, { key: "address", label: "Deal address" }, { key: "type", label: "Deal type" },
  { key: "pp_number", label: "PP number" }, { key: "deposit_date", label: "Deposit date" }, { key: "gci", label: "Gross commission" },
  { key: "net", label: "Net (GCI less fees)" }, { key: "total_received", label: "Total received" }, { key: "company_dollar", label: "Company dollar" },
  { key: "agents", label: "Agent names" }, { key: "parties", label: "Parties" }, { key: "today", label: "Today's date" },
  { key: "payments_list", label: "Payments received (one per line)" }, { key: "payouts_list", label: "Agent payouts (one per line)" },
  { key: "referral_list", label: "Referral fees (one per line)" },
];

/** The value for one source, or null if it is not a known source. */
export function sourceValue(key: string, data: DealDocData): string | null {
  return FIELD_SOURCES.some((source) => source.key === key) ? valueOf(key, data) : null;
}

type TemplateShape = { body: string; file_path?: string | null; field_map?: unknown; fields?: unknown };

/** The boxes a person fills in for each deal, for a text layout or a PDF form (in the PDF's own field order). */
export function templateFillLabels(template: TemplateShape): string[] {
  if (!template.file_path) return fillLabels(template.body);
  const map = (template.field_map ?? {}) as Record<string, unknown>;
  const order = Array.isArray(template.fields) ? (template.fields as { name?: unknown }[]).map((field) => String(field.name ?? "")) : [];
  const names = [...order.filter((name) => name in map), ...Object.keys(map).filter((name) => !order.includes(name))];
  const labels: string[] = [];
  for (const name of names) {
    const value = map[name];
    if (typeof value === "string" && value.startsWith("fill:")) {
      const label = value.slice(5).trim().slice(0, 60);
      if (label && !labels.includes(label)) labels.push(label);
    }
  }
  return labels.slice(0, 60);
}

/** Every PDF field's value for one deal: mapped sources plus what was typed in. */
export function pdfValues(fieldMap: unknown, data: DealDocData, filled: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [field, source] of Object.entries((fieldMap ?? {}) as Record<string, unknown>)) {
    if (typeof source !== "string" || !source) continue;
    const value = source.startsWith("fill:") ? filled[source.slice(5).trim().slice(0, 60)] ?? "" : sourceValue(source, data) ?? "";
    if (value && value !== "–") values[field] = value;
  }
  return values;
}

/** A first guess at what belongs in a field, from its name. The manager confirms it. */
export function guessSource(fieldName: string): string {
  const name = fieldName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (FIELD_SOURCES.some((source) => source.key === name)) return name;
  const hints: [RegExp, string][] = [
    [/address|property/, "address"], [/gci|gross/, "gci"], [/^net|net_comm/, "net"], [/deposit_?date|date_of_deposit/, "deposit_date"],
    [/pp_?(no|num)|transaction_?(no|num)/, "pp_number"], [/brokerage|company_name|firm/, "brokerage"], [/deal_?type|side/, "type"],
    [/agent/, "agents"], [/total/, "total_received"], [/^date$|today|prepared_on/, "today"],
  ];
  return hints.find(([pattern]) => pattern.test(name))?.[1] ?? "";
}

/** The fill-in labels a layout asks for, in order, without repeats. */
export function fillLabels(body: string): string[] {
  const labels: string[] = [];
  for (const match of body.matchAll(TAG)) {
    const name = (match[1] ?? "").trim();
    if (name.toLowerCase().startsWith("fill:")) {
      const label = name.slice(5).trim().slice(0, 60);
      if (label && !labels.includes(label)) labels.push(label);
    }
  }
  return labels.slice(0, 30);
}

/** Placeholders in a layout that Kinu does not recognise (usually a typo). */
export function unknownTags(body: string): string[] {
  const unknown = new Set<string>();
  for (const match of body.matchAll(TAG)) {
    const name = (match[1] ?? "").trim();
    const lower = name.toLowerCase();
    if (lower.startsWith("fill:")) continue;
    if ((SECTIONS as readonly string[]).includes(lower) || lower === "page_break" || lower === "new_page") continue;
    if (valueOf(lower, sampleDocData("x")) === null) unknown.add(`{{${name}}}`);
  }
  return [...unknown];
}

function inline(text: string, data: DealDocData): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(TAG)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ kind: "text", text: text.slice(last, at) });
    const name = (match[1] ?? "").trim();
    const lower = name.toLowerCase();
    if (lower.startsWith("fill:")) parts.push({ kind: "fill", label: name.slice(5).trim().slice(0, 60) });
    else {
      const value = valueOf(lower, data);
      parts.push(value === null ? { kind: "unknown", text: match[0] } : { kind: "text", text: value });
    }
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export function buildBlocks(body: string, data: DealDocData): Block[] {
  const blocks: Block[] = [];
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n").slice(0, 600)) {
    const line = raw.trimEnd();
    const bare = line.trim();
    if (bare === "") { blocks.push({ kind: "space" }); continue; }
    if (/^-{3,}$/.test(bare)) { blocks.push({ kind: "rule" }); continue; }
    if (/^\{\{\s*(page_break|new_page|page 2)\s*\}\}$/i.test(bare)) { blocks.push({ kind: "page_break" }); continue; }
    const section = bare.match(/^\{\{\s*([a-z_]+)\s*\}\}$/i)?.[1]?.toLowerCase();
    if (section && (SECTIONS as readonly string[]).includes(section)) { blocks.push({ kind: section as (typeof SECTIONS)[number] }); continue; }
    if (bare.startsWith("## ")) blocks.push({ kind: "heading", parts: inline(bare.slice(3), data) });
    else if (bare.startsWith("# ")) blocks.push({ kind: "title", parts: inline(bare.slice(2), data) });
    else blocks.push({ kind: "line", parts: inline(line, data) });
  }
  return blocks;
}
