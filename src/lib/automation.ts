import "server-only";
import { SigningError, cancelEnvelope, documensoReady, sendEnvelope, sendForSignature, type PlacedBox } from "@/lib/documenso";
import { readTiers } from "@/lib/ops";
import { done, fail, failure, type Result } from "@/lib/result";
import { riderPdf } from "@/lib/rider-pdf";
import { flattened, readBoxes, type SignBox } from "@/lib/sign-fields";
import type { createClient } from "@/lib/supabase/server";

/**
 * The steps Kinu takes by itself once a brokerage has switched them on
 * (Settings, Automation). Every one of them runs as the signed-in person, so
 * the database still decides what is allowed, and every one prepares work for
 * a person to sign or approve; none of them moves money.
 */
type Db = Awaited<ReturnType<typeof createClient>>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const riderReference = (ws: string, rider: string, agent: string) => `kinu:${ws}:${rider}:${agent}`;
export const documentReference = (ws: string) => `kinu:${ws}:document`;
const problemOf = (error: unknown) => (error instanceof SigningError ? error.message : "please try again.");

export type Rules = { default_tiers: unknown; send_pack_on_invite: boolean; send_rider_on_invite: boolean; send_rider_on_tier: boolean; team_rider_mode: "lead" | "members" };
const STARTING: Rules = { default_tiers: null, send_pack_on_invite: true, send_rider_on_invite: false, send_rider_on_tier: false, team_rider_mode: "lead" };

export async function rulesOf(supabase: Db, ws: string): Promise<Rules> {
  const { data } = await supabase.from("automation").select("default_tiers, send_pack_on_invite, send_rider_on_invite, send_rider_on_tier, team_rider_mode").eq("workspace_id", ws).maybeSingle();
  return data ? (data as Rules) : STARTING;
}

/**
 * Send a rider to be signed. An individual rider goes to its agent. A team
 * rider goes to the team lead or to every member. Each person gets their own
 * copy: the brokerage's rider document, then a schedule page with their
 * numbers and the place to sign.
 */
export async function riderOut(supabase: Db, ws: string, brokerage: string, riderId: string, mode: "lead" | "members", alreadyCurrent = false): Promise<Result> {
  if (!documensoReady()) return fail("Electronic signing is not switched on yet. You can still record a signature by hand.");
  const { data: rider } = await supabase.from("riders").select("id, agent_id, team_id, version, split_pct, tiers, status, is_current")
    .eq("id", riderId).eq("workspace_id", ws).maybeSingle();
  // A rider made current by a tier approval can still go to the agent to sign as their record.
  const approved = alreadyCurrent && rider?.status === "signed" && rider.is_current === true;
  if (!rider || (!["draft", "sent"].includes(rider.status as string) && !approved)) return fail("That rider is not waiting for a signature.");

  let teamName: string | null = null;
  let signerIds: string[] = [];
  if (rider.agent_id) signerIds = [rider.agent_id as string];
  else {
    const { data: team } = await supabase.from("teams").select("name, lead_agent_id").eq("id", rider.team_id as string).eq("workspace_id", ws).maybeSingle();
    if (!team) return fail("That team could not be found.");
    teamName = team.name as string;
    if (mode === "lead") {
      if (!team.lead_agent_id) return fail("This team has no lead yet. Choose a lead on the Teams page, or send it to every member.");
      signerIds = [team.lead_agent_id as string];
    } else {
      const { data: members } = await supabase.from("team_members").select("agent_id").eq("team_id", rider.team_id as string).eq("workspace_id", ws).limit(200);
      signerIds = [...new Set([...(team.lead_agent_id ? [team.lead_agent_id as string] : []), ...(members ?? []).map((m) => m.agent_id as string)])];
      if (!signerIds.length) return fail("This team has no members yet.");
    }
  }
  const { data: people } = await supabase.from("agents").select("id, full_name, email").eq("workspace_id", ws).in("id", signerIds);
  const signers = (people ?? []) as { id: string; full_name: string; email: string | null }[];
  if (signers.length !== signerIds.length) return fail("Some of the people on this rider are outside your view, so it cannot be sent from this login.");
  const noEmail = signers.filter((a) => !a.email || !EMAIL.test(a.email));
  if (noEmail.length) return fail(`Add an email address first for: ${noEmail.map((a) => a.full_name).join(", ")}.`);

  const { data: open } = await supabase.from("sign_requests").select("agent_id").eq("workspace_id", ws).eq("rider_id", riderId).in("status", ["sent", "opened", "signed"]);
  const already = new Set((open ?? []).map((r) => r.agent_id as string));
  const todo = signers.filter((a) => !already.has(a.id));
  if (!todo.length) return fail("This rider is already out for signature. Use Remind, or Cancel it to send again.");

  let template: Uint8Array | null = null;
  const { data: workspace } = await supabase.from("workspaces").select("rider_template_path").eq("id", ws).maybeSingle();
  if (workspace?.rider_template_path) {
    const file = await supabase.storage.from("documents").download(workspace.rider_template_path as string);
    if (file.error || !file.data) return fail("Your rider document could not be opened. Upload it again, then send.");
    template = new Uint8Array(await file.data.arrayBuffer());
  }

  let sent = 0;
  for (const person of todo) {
    try {
      const built = await riderPdf({
        brokerage, signer: person.full_name, subject: rider.agent_id ? person.full_name : `${teamName} team`, teamName: rider.agent_id ? null : teamName,
        version: rider.version as number, splitPct: Number(rider.split_pct), tiers: readTiers(rider.tiers),
      }, template);
      if (template && !built.usedTemplate) return fail("Your rider document is locked with a password or damaged. Upload an unlocked PDF, then send.");
      const envelope = await sendForSignature({
        title: `${brokerage} rider v${rider.version} - ${person.full_name}`, pdf: built.bytes,
        signer: { name: person.full_name, email: person.email as string }, reference: riderReference(ws, riderId, person.id), boxes: built.boxes,
        subject: `${brokerage}: please sign your rider`,
        message: `${brokerage} has sent you a commission rider to review and sign. It takes about a minute.`,
      });
      const { error } = await supabase.rpc("open_sign_request", { ws, rider: riderId, agent: person.id, name: person.full_name, email: person.email, envelope, mode });
      if (error) {
        await cancelEnvelope(envelope).catch(() => {});
        return failure(error);
      }
      sent += 1;
    } catch (error) {
      if (sent) return fail(`Sent to ${sent} of ${todo.length}. The rest did not go: ${problemOf(error)}`);
      return fail(error instanceof SigningError ? error.message : "That did not work. Please try again.");
    }
  }
  return done(sent === 1 ? `Sent to ${todo[0]!.full_name} to sign.` : `Sent to ${sent} people to sign.`);
}

type PackTemplate = { id: string; name: string; file_path: string; page_count: number; roles: string[]; fields: unknown; default_signers: unknown };
type Person = { id: string; full_name: string; email: string | null };

/** Send one prepared document to one agent, with the other signers the brokerage set for it. Returns a problem in words, or null. */
async function templateOut(supabase: Db, ws: string, brokerage: string, template: PackTemplate, agent: Person, pdf: Uint8Array): Promise<string | null> {
  if (!agent.email || !EMAIL.test(agent.email)) return `${agent.full_name} has no email address`;
  const roles = template.roles ?? [];
  const boxes = readBoxes(template.fields, roles.length, template.page_count) ?? [];
  const others = (Array.isArray(template.default_signers) ? template.default_signers : []) as { name?: string; email?: string }[];
  const people = roles.map((role, index) => index === 0
    ? { name: agent.full_name, email: agent.email!.toLowerCase(), role, agent_id: agent.id as string | null }
    : { name: String(others[index - 1]?.name ?? ""), email: String(others[index - 1]?.email ?? "").toLowerCase(), role, agent_id: null as string | null });
  if (people.some((person) => person.name.length < 2 || !EMAIL.test(person.email))) return `“${template.name}” has no named signer for every role`;
  if (new Set(people.map((person) => person.email)).size !== people.length) return `“${template.name}” would go to the same email twice`;
  if (roles.some((_, index) => !boxes.some((box) => box.role === index && box.type === "signature"))) return `“${template.name}” is missing a signature box`;
  const place = (box: SignBox): PlacedBox => ({ type: box.type, page: box.page, x: box.x, y: box.y, width: box.w, height: box.h, label: box.label, required: box.required });
  let envelope: string;
  try {
    envelope = await sendEnvelope({
      title: `${brokerage} - ${template.name}`, pdf, reference: documentReference(ws),
      subject: `${brokerage}: please sign “${template.name}”`, message: `${brokerage} has sent you “${template.name}” to review and sign.`,
      signers: people.map((person, index) => ({ name: person.name, email: person.email, boxes: boxes.filter((box) => box.role === index).map(place) })),
    });
  } catch (error) {
    return `“${template.name}”: ${problemOf(error)}`;
  }
  const { error } = await supabase.rpc("open_sign_document", { ws, template: template.id, doc_title: template.name, envelope, people });
  if (error) {
    await cancelEnvelope(envelope).catch(() => {});
    return `“${template.name}” could not be recorded`;
  }
  return null;
}

/** Every document in a pack ("invite" or "exit") goes to each of these agents. */
export async function packOut(supabase: Db, ws: string, brokerage: string, pack: "invite" | "exit", agentIds: string[]): Promise<{ sent: number; problems: string[] }> {
  const result = { sent: 0, problems: [] as string[] };
  if (!agentIds.length || !documensoReady()) return result;
  const { data: rows } = await supabase.from("sign_templates").select("id, name, file_path, page_count, roles, fields, default_signers").eq("workspace_id", ws).eq("active", true).eq("pack", pack).order("name").limit(20);
  const templates = (rows ?? []) as PackTemplate[];
  if (!templates.length) return result;
  const { data: people } = await supabase.from("agents").select("id, full_name, email").eq("workspace_id", ws).in("id", agentIds);
  for (const template of templates) {
    const file = await supabase.storage.from("documents").download(template.file_path);
    if (file.error || !file.data) { result.problems.push(`“${template.name}” could not be opened`); continue; }
    const pdf = await flattened(new Uint8Array(await file.data.arrayBuffer()));
    for (const agent of (people ?? []) as Person[]) {
      const problem = await templateOut(supabase, ws, brokerage, template, agent, pdf);
      if (problem) result.problems.push(problem); else result.sent += 1;
    }
  }
  return result;
}

/** After agents are invited: send the new-agent documents and, if the brokerage chose to, each first rider. Returns a sentence for staff. */
export async function afterInvite(supabase: Db, ws: string, brokerage: string, agentIds: string[]): Promise<string> {
  if (!agentIds.length || !documensoReady()) return "";
  const rules = await rulesOf(supabase, ws);
  const said: string[] = [];
  const problems: string[] = [];
  if (rules.send_pack_on_invite) {
    const pack = await packOut(supabase, ws, brokerage, "invite", agentIds);
    if (pack.sent) said.push(`${pack.sent} document${pack.sent === 1 ? "" : "s"} sent for signature`);
    problems.push(...pack.problems);
  }
  if (rules.send_rider_on_invite) {
    const { data: riders } = await supabase.from("riders").select("id, agent_id").eq("workspace_id", ws).in("agent_id", agentIds).eq("status", "sent");
    let sent = 0;
    for (const rider of riders ?? []) {
      const result = await riderOut(supabase, ws, brokerage, rider.id as string, "lead");
      if (result.ok) sent += 1; else if (result.message) problems.push(result.message);
    }
    if (sent) said.push(`${sent} rider${sent === 1 ? "" : "s"} sent for signature`);
  }
  const unique = [...new Set(problems)].slice(0, 4);
  return [said.length ? `Also done automatically: ${said.join(", ")}.` : "", unique.length ? `Not sent automatically: ${unique.join("; ")}.` : ""].filter(Boolean).join(" ");
}

/**
 * After a tier move is approved. If the rider the agent already signed lists
 * this tier, the move was agreed in advance and nothing new needs signing.
 * Only a split that is outside the signed terms sends a new rider, and only
 * if the brokerage chose that.
 */
export async function afterTierApproved(supabase: Db, ws: string, brokerage: string, approvalId: string): Promise<string> {
  const { data: approval } = await supabase.from("tier_approvals").select("rider_from_id, rider_to_id, to_pct").eq("id", approvalId).eq("workspace_id", ws).maybeSingle();
  if (!approval?.rider_to_id) return "";
  if (approval.rider_from_id) {
    const { data: signed } = await supabase.from("riders").select("tiers, signed_at").eq("id", approval.rider_from_id as string).eq("workspace_id", ws).maybeSingle();
    const agreed = readTiers(signed?.tiers).some((tier) => Math.abs(tier.pct - Number(approval.to_pct)) < 0.005);
    if (agreed) return " No new signature is needed: this tier is already in the rider they signed.";
  }
  if (!documensoReady()) return " This split is outside the tiers in their signed rider, so a new rider should be signed.";
  const rules = await rulesOf(supabase, ws);
  if (!rules.send_rider_on_tier) return " This split is outside the tiers in their signed rider. Send the new rider for signature from this page.";
  const result = await riderOut(supabase, ws, brokerage, approval.rider_to_id as string, rules.team_rider_mode, true);
  return result.ok ? ` This split is outside the tiers in their signed rider, so the new rider was sent to be signed. ${result.message ?? ""}` : ` The new rider was not sent automatically: ${result.message ?? "please send it from this page."}`;
}
