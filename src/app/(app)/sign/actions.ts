"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionAccess } from "@/lib/access";
import { documentReference } from "@/lib/automation";
import { SigningError, cancelEnvelope, documensoReady, envelopeState, remind, sendEnvelope, type PlacedBox } from "@/lib/documenso";
import { done, fail, failure, text, uuid, type Result } from "@/lib/result";
import { flattened, inspectPdf, readBoxes, type SignBox } from "@/lib/sign-fields";
import { settleDocuments } from "@/lib/sign-settle";
import { createClient } from "@/lib/supabase/server";

const NOT_READY = "Electronic signing is not switched on yet.";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const reference = documentReference;
const problem = (error: unknown) => fail(error instanceof SigningError ? error.message : "That did not work. Please try again.");

/** People who manage files or riders may prepare and send documents. */
async function gate() {
  const files = await actionAccess("files.manage");
  return "denied" in files ? actionAccess("riders.manage") : files;
}

function readRoles(value: string): string[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 6) return null;
    const roles = parsed.map((role) => (typeof role === "string" ? role.trim().slice(0, 40) : ""));
    return roles.every((role) => role.length > 0) ? roles : null;
  } catch {
    return null;
  }
}

/** Upload a PDF to sign. Kinu reads its pages and any fill-in fields, then opens the editor. */
export async function createTemplate(_prev: Result, form: FormData): Promise<Result> {
  const access = await gate();
  if ("denied" in access) return fail(access.denied);
  const name = text(form, "name", 120);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a PDF first.");
  if (file.type !== "application/pdf") return fail("Use a PDF.");
  if (file.size > 4 * 1024 * 1024) return fail("That PDF is larger than 4 MB. Save a smaller copy and try again.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return fail("That file is not a valid PDF.");
  const read = await inspectPdf(bytes);
  if (!read) return fail("That PDF is locked with a password or damaged. Save an unlocked copy and try again.");
  if (read.pages > 200) return fail("That PDF has more than 200 pages.");

  const supabase = await createClient();
  const ws = access.access.workspace.id;
  const path = `${ws}/sign/template-${randomUUID()}.pdf`;
  const stored = await supabase.storage.from("documents").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (stored.error) return fail("We could not store that file. Please try again.");
  const title = name.length >= 2 ? name : file.name.replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9 ._-]+/g, " ").trim().slice(0, 120) || "Document";
  const { data, error } = await supabase.rpc("save_sign_template", { ws, template: null, template_name: title, path, pages: read.pages, signer_roles: ["Agent"], boxes: read.boxes });
  if (error) return failure(error);
  revalidatePath("/sign");
  redirect(`/sign/templates/${data as string}`);
}

/** Save the boxes, signers and name from the editor. */
export async function saveTemplate(_prev: Result, form: FormData): Promise<Result> {
  const access = await gate();
  if ("denied" in access) return fail(access.denied);
  const template = uuid(form, "template");
  const name = text(form, "name", 120);
  if (!template) return fail("That document could not be found.");
  if (name.length < 2) return fail("Give the document a name.");
  const roles = readRoles(String(form.get("roles") ?? ""));
  if (!roles) return fail("Add one to six signers, each with a short name.");
  const supabase = await createClient();
  const ws = access.access.workspace.id;
  const { data: row } = await supabase.from("sign_templates").select("page_count").eq("id", template).eq("workspace_id", ws).eq("active", true).maybeSingle();
  if (!row) return fail("That document could not be found.");
  let parsed: unknown;
  try { parsed = JSON.parse(String(form.get("boxes") ?? "")); } catch { parsed = null; }
  const boxes = readBoxes(parsed, roles.length, row.page_count as number);
  if (!boxes) return fail("The boxes could not be read. Refresh the page and try again.");
  const missing = roles.filter((_, index) => !boxes.some((box) => box.role === index && box.type === "signature"));
  if (missing.length) return fail(`Add a signature box for: ${missing.join(", ")}.`);
  const { error } = await supabase.rpc("save_sign_template", { ws, template, template_name: name, path: null, pages: row.page_count, signer_roles: roles, boxes });
  if (error) return failure(error);
  revalidatePath("/sign");
  return done(`Saved. ${boxes.length} box${boxes.length === 1 ? "" : "es"} for ${roles.length} signer${roles.length === 1 ? "" : "s"}.`);
}

export async function removeTemplate(_prev: Result, form: FormData): Promise<Result> {
  const access = await gate();
  if ("denied" in access) return fail(access.denied);
  const template = uuid(form, "template");
  if (!template) return fail("That document could not be found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_sign_template", { ws: access.access.workspace.id, template });
  if (error) return failure(error);
  revalidatePath("/sign");
  return done("Removed. Copies already sent are not affected.");
}

/** Send a prepared document to its signers. Each signer is an agent, or a name and email typed in. */
export async function sendDocument(_prev: Result, form: FormData): Promise<Result> {
  const access = await gate();
  if ("denied" in access) return fail(access.denied);
  if (!documensoReady()) return fail(NOT_READY);
  const template = uuid(form, "template");
  if (!template) return fail("That document could not be found.");
  const supabase = await createClient();
  const ws = access.access.workspace.id;
  const { data: row } = await supabase.from("sign_templates").select("id, name, file_path, page_count, roles, fields").eq("id", template).eq("workspace_id", ws).eq("active", true).maybeSingle();
  if (!row) return fail("That document could not be found.");
  const roles = (row.roles as string[]) ?? [];
  const boxes = readBoxes(row.fields, roles.length, row.page_count as number) ?? [];
  const title = text(form, "title", 200) || (row.name as string);

  const people: { name: string; email: string; role: string; agent_id: string | null }[] = [];
  for (let index = 0; index < roles.length; index += 1) {
    const agentId = uuid(form, `agent_${index}`);
    if (agentId) {
      const { data: agent } = await supabase.from("agents").select("id, full_name, email").eq("id", agentId).eq("workspace_id", ws).maybeSingle();
      if (!agent) return fail(`The agent chosen for ${roles[index]} could not be found.`);
      if (!agent.email || !EMAIL.test(agent.email as string)) return fail(`${agent.full_name} has no email address yet. Add one on their page first.`);
      people.push({ name: agent.full_name as string, email: (agent.email as string).toLowerCase(), role: roles[index]!, agent_id: agent.id as string });
    } else {
      const name = text(form, `name_${index}`, 160), email = text(form, `email_${index}`, 254).toLowerCase();
      if (name.length < 2 || !EMAIL.test(email)) return fail(`Choose an agent for ${roles[index]}, or type their name and email.`);
      people.push({ name, email, role: roles[index]!, agent_id: null });
    }
  }
  if (new Set(people.map((person) => person.email)).size !== people.length) return fail("Each signer needs a different email address.");
  const unsigned = roles.filter((_, index) => !boxes.some((box) => box.role === index && box.type === "signature"));
  if (unsigned.length) return fail(`This document has no signature box for: ${unsigned.join(", ")}. Open “Edit boxes” and add one.`);

  const file = await supabase.storage.from("documents").download(row.file_path as string);
  if (file.error || !file.data) return fail("The document could not be opened. Upload it again.");
  const pdf = await flattened(new Uint8Array(await file.data.arrayBuffer()));
  const place = (box: SignBox): PlacedBox => ({ type: box.type, page: box.page, x: box.x, y: box.y, width: box.w, height: box.h, label: box.label, required: box.required });
  const brokerage = access.access.workspace.name;
  let envelope: string;
  try {
    envelope = await sendEnvelope({
      title: `${brokerage} - ${title}`, pdf, reference: reference(ws),
      subject: `${brokerage}: please sign “${title}”`, message: `${brokerage} has sent you “${title}” to review and sign.`,
      signers: people.map((person, index) => ({ name: person.name, email: person.email, boxes: boxes.filter((box) => box.role === index).map(place) })),
    });
  } catch (error) {
    return problem(error);
  }
  const { error } = await supabase.rpc("open_sign_document", { ws, template, doc_title: title, envelope, people });
  if (error) {
    await cancelEnvelope(envelope).catch(() => {});
    return failure(error);
  }
  revalidatePath("/sign");
  redirect("/sign?sent=1");
}

type OpenDoc = { id: string; envelope_id: string; status: string; signers: { email: string; status: string }[] };

/** Check every document that is out for signature and file the finished ones. */
export async function checkDocuments(): Promise<Result> {
  const access = await gate();
  if ("denied" in access) return fail(access.denied);
  if (!documensoReady()) return fail(NOT_READY);
  const supabase = await createClient();
  const result = await settleDocuments(supabase, access.access.workspace.id);
  if (!result.checked) return done("Nothing is out for signature right now.");
  revalidatePath("/sign");
  if (result.signed) revalidatePath("/agents");
  const parts = [`${result.signed} newly signed`, result.declined ? `${result.declined} declined` : "", `${result.checked - result.signed - result.declined - result.trouble} still waiting`, result.trouble ? `${result.trouble} could not be checked` : ""].filter(Boolean);
  return done(`Checked ${result.checked}: ${parts.join(", ")}.`);
}

async function one(form: FormData) {
  const access = await gate();
  if ("denied" in access) return { message: access.denied };
  const id = uuid(form, "doc");
  if (!id) return { message: "That document could not be found." };
  const supabase = await createClient();
  const ws = access.access.workspace.id;
  const { data } = await supabase.from("sign_documents").select("id, envelope_id, status, signers").eq("id", id).eq("workspace_id", ws).in("status", ["sent", "opened"]).maybeSingle();
  if (!data) return { message: "That document is not waiting for anyone." };
  return { supabase, ws, doc: data as OpenDoc };
}

export async function remindDocument(_prev: Result, form: FormData): Promise<Result> {
  const found = await one(form);
  if ("message" in found) return fail(found.message ?? "That did not work.");
  if (!documensoReady()) return fail(NOT_READY);
  try {
    const state = await envelopeState(found.doc.envelope_id, reference(found.ws));
    if (!state.waiting.length) return fail("Everyone has already signed. Use “Check now”.");
    await remind(found.doc.envelope_id, state.waiting);
  } catch (error) {
    return problem(error);
  }
  return done("Reminder sent to everyone who has not signed.");
}

export async function cancelDocument(_prev: Result, form: FormData): Promise<Result> {
  const found = await one(form);
  if ("message" in found) return fail(found.message ?? "That did not work.");
  if (documensoReady()) await cancelEnvelope(found.doc.envelope_id).catch(() => {});
  const { error } = await found.supabase.rpc("update_sign_document", { ws: found.ws, doc: found.doc.id, new_status: "cancelled", signer_states: [], signed_file: null, certificate_file: null });
  if (error) return failure(error);
  revalidatePath("/sign");
  return done("Cancelled. Nobody can sign that copy now.");
}

/** Choose whether a document goes out by itself (when an agent is invited, or leaves) and who signs its other roles. */
export async function setTemplatePack(_prev: Result, form: FormData): Promise<Result> {
  const access = await gate();
  if ("denied" in access) return fail(access.denied);
  const template = uuid(form, "template");
  if (!template) return fail("That document could not be found.");
  const pack = text(form, "pack", 10);
  if (!["none", "invite", "exit"].includes(pack)) return fail("Choose when this document is sent.");
  const people: { name: string; email: string }[] = [];
  for (let index = 1; index <= 5; index += 1) {
    if (form.get(`signer_name_${index}`) === null) break;
    people.push({ name: text(form, `signer_name_${index}`, 160), email: text(form, `signer_email_${index}`, 254).toLowerCase() });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_template_pack", { ws: access.access.workspace.id, template, new_pack: pack, people });
  if (error) return failure(error);
  revalidatePath("/sign");
  return done(pack === "invite" ? "Saved. This goes to every new agent as soon as they are invited." : pack === "exit" ? "Saved. This goes to an agent when they are marked as leaving." : "Saved. This is only sent when you choose to.");
}
