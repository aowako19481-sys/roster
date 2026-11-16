"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { SigningError, cancelEnvelope, documensoReady, downloadCertificate, downloadSigned, envelopeState, remind, sendForSignature } from "@/lib/documenso";
import { parseTiers, readTiers, type Tier } from "@/lib/ops";
import { riderPdf } from "@/lib/rider-pdf";
import { done, fail, failure, num, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

function refresh(agentId?: string | null) {
  revalidatePath("/riders");
  revalidatePath("/agents");
  revalidatePath("/teams");
  if (agentId) revalidatePath(`/agents/${agentId}`);
}

const DECISIONS: Record<string, string> = {
  approve: "Approved. The new rider is now the current one.",
  hold: "Held for review.",
  reopen: "Back in the waiting list.",
  undo: "Approval undone. The earlier rider is current again.",
};

/** Approve, hold, reopen or undo a tier move. The database checks who may and does the work. */
export async function decideTier(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("tiers.approve");
  if ("denied" in gate) return fail(gate.denied);
  const approval = uuid(form, "approval");
  const decision = text(form, "decision", 12);
  if (!approval || !(decision in DECISIONS)) return fail("That action is not available.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_tier", { ws: gate.access.workspace.id, approval, decision });
  if (error) return failure(error);
  refresh();
  return done(DECISIONS[decision]);
}

/** Record a signature the brokerage collected itself (for example on paper). */
export async function recordSignature(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  const rider = uuid(form, "rider");
  const signer = text(form, "signer", 120);
  if (!rider) return fail("That rider could not be found.");
  if (signer.length < 2) return fail("Enter the name of the person who signed.");
  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  const { data: row } = await supabase.from("riders").select("agent_id").eq("id", rider).eq("workspace_id", ws).maybeSingle();
  const { error } = await supabase.rpc("mark_rider_signed", { ws, rider, signer });
  if (error) return failure(error);
  refresh(row?.agent_id as string | null | undefined);
  return done("Signature recorded. This rider is now the current one.");
}

/**
 * Draft a rider amendment for an agent or a team. It changes nothing about
 * pay until it is signed. Tiers are kept from the current rider unless new
 * ones are typed in.
 */
export async function draftRider(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  const agent = uuid(form, "agent");
  const team = uuid(form, "team");
  const pct = num(form, "pct");
  if (Boolean(agent) === Boolean(team)) return fail("Choose one agent or one team.");
  if (pct === null || pct < 0 || pct > 100) return fail("Enter a split from 0 to 100.");

  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  // The subject must be in this brokerage (row-level security hides anything else).
  const subject = agent
    ? await supabase.from("agents").select("id").eq("id", agent).eq("workspace_id", ws).maybeSingle()
    : await supabase.from("teams").select("id").eq("id", team!).eq("workspace_id", ws).maybeSingle();
  if (!subject.data) return fail(agent ? "That agent could not be found." : "That team could not be found.");

  let tiers: Tier[] = [];
  if (form.has("tiers")) {
    const parsed = parseTiers(text(form, "tiers", 2000));
    if ("problem" in parsed) return fail(parsed.problem);
    tiers = parsed.tiers;
  } else {
    const current = await supabase.from("riders").select("tiers").eq("workspace_id", ws)
      .eq(agent ? "agent_id" : "team_id", (agent ?? team)!).eq("is_current", true).maybeSingle();
    tiers = readTiers(current.data?.tiers);
  }

  const { error } = await supabase.rpc("draft_rider", {
    ws, agent, team, pct: Math.round(pct * 100) / 100,
    // With no tiers the database's own default (an empty list) applies.
    ...(tiers.length ? { rider_tiers: tiers } : {}),
  });
  if (error) return failure(error);
  refresh(agent);
  return done("Amendment drafted. It takes effect only once it is signed.");
}

// ------------------------------------------------ electronic signature --

const NOT_READY = "Electronic signing is not switched on yet. You can still record a signature by hand.";
const reference = (ws: string, rider: string, agent: string) => `kinu:${ws}:${rider}:${agent}`;
const problem = (error: unknown) => fail(error instanceof SigningError ? error.message : "That did not work. Please try again.");

type OpenRequest = { id: string; rider_id: string; agent_id: string; envelope_id: string; status: string };

/**
 * Send a rider to be signed. An individual rider goes to its agent. A team
 * rider goes to the team lead or to every member, as chosen. Each person gets
 * their own copy: the brokerage's rider document, then a schedule page with
 * their numbers and the place to sign.
 */
export async function sendRider(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  if (!documensoReady()) return fail(NOT_READY);
  const riderId = uuid(form, "rider");
  if (!riderId) return fail("That rider could not be found.");
  const mode = text(form, "mode", 10) === "members" ? "members" : "lead";
  const supabase = await createClient();
  const ws = gate.access.workspace.id;

  const { data: rider } = await supabase.from("riders").select("id, agent_id, team_id, version, split_pct, tiers, status")
    .eq("id", riderId).eq("workspace_id", ws).maybeSingle();
  if (!rider || !["draft", "sent"].includes(rider.status as string)) return fail("That rider is not waiting for a signature.");

  // Who signs.
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
  const noEmail = signers.filter((a) => !a.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email));
  if (noEmail.length) return fail(`Add an email address first for: ${noEmail.map((a) => a.full_name).join(", ")}.`);

  const { data: open } = await supabase.from("sign_requests").select("agent_id").eq("workspace_id", ws).eq("rider_id", riderId).in("status", ["sent", "opened", "signed"]);
  const already = new Set((open ?? []).map((r) => r.agent_id as string));
  const todo = signers.filter((a) => !already.has(a.id));
  if (!todo.length) return fail("This rider is already out for signature. Use Remind, or Cancel it to send again.");

  // The brokerage's own rider document, if one was uploaded.
  let template: Uint8Array | null = null;
  const { data: workspace } = await supabase.from("workspaces").select("rider_template_path").eq("id", ws).maybeSingle();
  if (workspace?.rider_template_path) {
    const file = await supabase.storage.from("documents").download(workspace.rider_template_path as string);
    if (file.error || !file.data) return fail("Your rider document could not be opened. Upload it again, then send.");
    template = new Uint8Array(await file.data.arrayBuffer());
  }

  const brokerage = gate.access.workspace.name;
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
        signer: { name: person.full_name, email: person.email as string }, reference: reference(ws, riderId, person.id), boxes: built.boxes,
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
      refresh(rider.agent_id as string | null);
      if (sent) return fail(`Sent to ${sent} of ${todo.length}. The rest did not go: ${error instanceof SigningError ? error.message : "please try again."}`);
      return problem(error);
    }
  }
  refresh(rider.agent_id as string | null);
  return done(sent === 1 ? `Sent to ${todo[0]!.full_name} to sign.` : `Sent to ${sent} people to sign.`);
}

/** Reads one open request back from the signing service and files the signed copy when it is done. */
async function settle(supabase: Awaited<ReturnType<typeof createClient>>, ws: string, request: OpenRequest): Promise<string> {
  const state = await envelopeState(request.envelope_id, reference(ws, request.rider_id, request.agent_id));
  if (state.status === request.status) return state.status;
  let signedPath: string | null = null, certificatePath: string | null = null;
  if (state.status === "signed") {
    if (!state.itemId) throw new SigningError("The signed document could not be collected yet. Try again in a minute.");
    const pdf = await downloadSigned(state.itemId);
    signedPath = `${ws}/riders/${request.id}-signed.pdf`;
    const stored = await supabase.storage.from("documents").upload(signedPath, pdf, { contentType: "application/pdf", upsert: true });
    if (stored.error) throw new SigningError("The signed document could not be saved. Please try again.");
    const certificate = await downloadCertificate(request.envelope_id);
    if (certificate) {
      certificatePath = `${ws}/riders/${request.id}-certificate.pdf`;
      const kept = await supabase.storage.from("documents").upload(certificatePath, certificate, { contentType: "application/pdf", upsert: true });
      if (kept.error) certificatePath = null;
    }
  }
  const { data, error } = await supabase.rpc("update_sign_request", { ws, request: request.id, new_status: state.status, signed_file: signedPath, certificate_file: certificatePath });
  if (error) throw new SigningError(failure(error).message ?? "That did not work.");
  return (data as string) ?? state.status;
}

/** Check every rider that is out for signature, and file the ones that have been signed. */
export async function checkSignatures(): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  if (!documensoReady()) return fail(NOT_READY);
  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  const { data } = await supabase.from("sign_requests").select("id, rider_id, agent_id, envelope_id, status").eq("workspace_id", ws).in("status", ["sent", "opened"]).order("sent_at").limit(40);
  const open = (data ?? []) as OpenRequest[];
  if (!open.length) return done("Nothing is out for signature right now.");
  let signed = 0, declined = 0, trouble = 0;
  for (const request of open) {
    try {
      const result = await settle(supabase, ws, request);
      if (result === "signed" || result === "rider_signed") signed += 1;
      if (result === "declined") declined += 1;
    } catch {
      trouble += 1;
    }
  }
  refresh();
  const parts = [`${signed} newly signed`, declined ? `${declined} declined` : "", `${open.length - signed - declined - trouble} still waiting`, trouble ? `${trouble} could not be checked` : ""].filter(Boolean);
  return done(`Checked ${open.length}: ${parts.join(", ")}.`);
}

/** Email a reminder to everyone who has not signed a rider yet. */
export async function remindRider(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  if (!documensoReady()) return fail(NOT_READY);
  const riderId = uuid(form, "rider");
  if (!riderId) return fail("That rider could not be found.");
  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  const { data } = await supabase.from("sign_requests").select("id, rider_id, agent_id, envelope_id, status").eq("workspace_id", ws).eq("rider_id", riderId).in("status", ["sent", "opened"]);
  const open = (data ?? []) as OpenRequest[];
  if (!open.length) return fail("Nobody is waiting to sign this rider.");
  try {
    for (const request of open) {
      const state = await envelopeState(request.envelope_id, reference(ws, request.rider_id, request.agent_id));
      await remind(request.envelope_id, state.waiting);
    }
  } catch (error) {
    return problem(error);
  }
  return done(open.length === 1 ? "Reminder sent." : `Reminders sent to ${open.length} people.`);
}

/** Take a rider back: the documents can no longer be signed. Copies already signed stay on file. */
export async function cancelRiderSigning(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  const riderId = uuid(form, "rider");
  if (!riderId) return fail("That rider could not be found.");
  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  const { data } = await supabase.from("sign_requests").select("id, rider_id, agent_id, envelope_id, status").eq("workspace_id", ws).eq("rider_id", riderId).in("status", ["sent", "opened"]);
  const open = (data ?? []) as OpenRequest[];
  if (!open.length) return fail("Nobody is waiting to sign this rider.");
  for (const request of open) {
    if (documensoReady()) await cancelEnvelope(request.envelope_id).catch(() => {});
    const { error } = await supabase.rpc("update_sign_request", { ws, request: request.id, new_status: "cancelled", signed_file: null, certificate_file: null });
    if (error) return failure(error);
  }
  refresh();
  return done("Cancelled. Nobody can sign those copies now.");
}

/** Upload the brokerage's own rider document (a PDF). It goes in front of the schedule page on every rider sent. */
export async function setRiderTemplate(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  if (text(form, "remove", 5) === "yes") {
    const { error } = await supabase.rpc("set_rider_template", { ws, file_path: null, file_name: null });
    if (error) return failure(error);
    refresh();
    return done("Removed. Riders will go out with the Kinu rider page only.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose your rider PDF first.");
  if (file.type !== "application/pdf") return fail("Use a PDF.");
  if (file.size > 4 * 1024 * 1024) return fail("That PDF is larger than 4 MB. Save a smaller copy and try again.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return fail("That file is not a valid PDF.");
  const test = await riderPdf({ brokerage: "", signer: "", subject: "", teamName: null, version: 1, splitPct: 0, tiers: [] }, bytes);
  if (!test.usedTemplate) return fail("That PDF is locked with a password or damaged. Save an unlocked copy and try again.");
  const path = `${ws}/riders/template-${randomUUID()}.pdf`;
  const stored = await supabase.storage.from("documents").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (stored.error) return fail("We could not store that file. Please try again.");
  const { error } = await supabase.rpc("set_rider_template", { ws, file_path: path, file_name: file.name.normalize("NFKD").replace(/[^A-Za-z0-9._ -]+/g, "").slice(0, 120) || "rider.pdf" });
  if (error) return failure(error);
  refresh();
  return done("Saved. This document now goes out with every rider.");
}
