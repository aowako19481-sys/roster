import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { ACK_TEXT, consentText, type Evidence } from "@/lib/esign";
import { signedRecordPdf, type SignatureRecord } from "@/lib/pdf";
import { hashToken, TOKEN_PATTERN } from "@/lib/invite-token";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The agent onboarding portal. The visitor has no login, only a private
 * link. This is the one place the server's secret key is used for data: it
 * calls the portal_* database functions, which work on exactly the agent the
 * link belongs to and nothing else. Nothing here trusts an id from the
 * browser; the token is the only handle.
 */

export type PortalState = {
  brokerage: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  office: string;
  details_done: boolean;
  licence_status: string;
  licence_masked: string | null;
  licence_expires_on: string | null;
  has_licence_photo: boolean;
  w9_status: string;
  rider: { split_pct: number; tiers: { from: number; to: number | null; pct: number }[]; status: string; version: number } | null;
  rider_status: string;
  upload_prefix: string;
  expires_at: string;
};

export type PortalLookup =
  | { kind: "ok"; state: PortalState }
  | { kind: "gone" }          // unknown, expired or malformed link
  | { kind: "off" };          // the server key is not configured yet

function client() {
  return createAdminClient();
}

export async function loadPortal(token: string): Promise<PortalLookup> {
  if (!TOKEN_PATTERN.test(token)) return { kind: "gone" };
  const admin = client();
  if (!admin) return { kind: "off" };
  const { data, error } = await admin.rpc("portal_state", { token_hash: hashToken(token) });
  if (error) {
    console.error("portal: state failed", error.code);
    return { kind: "gone" };
  }
  if (!data) return { kind: "gone" };
  return { kind: "ok", state: data as PortalState };
}

type Call = { error: { code?: string; message?: string } | null };

async function call(token: string, fn: string, args: Record<string, unknown>): Promise<Call> {
  if (!TOKEN_PATTERN.test(token)) return { error: { code: "P0001", message: "This link is not valid." } };
  const admin = client();
  if (!admin) return { error: { code: "P0001", message: "Onboarding is not switched on yet." } };
  const { error } = await admin.rpc(fn, { token_hash: hashToken(token), ...args });
  return { error };
}

export const saveDetails = (token: string, name: string, phone: string) =>
  call(token, "portal_save_details", { new_name: name, new_phone: phone });

export const saveW9 = (token: string, legal: string, last4: string) =>
  call(token, "portal_save_w9", { legal, last4, reference: "placeholder" });

export const signRider = (token: string, typedName: string, consent: boolean, brokerage: string, proof: Evidence) =>
  call(token, "portal_sign_rider", {
    typed_name: typedName, consent, signer_note: "E-signature · typed name and consent",
    consent_text: consentText(brokerage), ip: proof.ip, agent_string: proof.userAgent,
  });

const UPLOAD_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Do the file's first bytes match the type it claims to be? */
function looksLike(type: string, head: Uint8Array) {
  const at = (i: number) => head[i] ?? -1;
  if (type === "application/pdf") return at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46;
  if (type === "image/png") return at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47;
  if (type === "image/jpeg") return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
  if (type === "image/webp") return at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45;
  return false;
}

/** Checks and stores an agent's upload under their own folder, with a name we choose. */
async function storeUpload(prefix: string, label: string, file: File): Promise<{ path: string } | { message: string }> {
  const extension = UPLOAD_TYPES[file.type];
  if (!extension) return { message: "Upload a photo (JPEG, PNG, WebP) or a PDF." };
  if (file.size > MAX_UPLOAD_BYTES) return { message: "That file is larger than 10 MB." };
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!looksLike(file.type, head)) return { message: "That file is not a valid photo or PDF." };
  const admin = client();
  if (!admin) return { message: "Onboarding is not switched on yet." };
  const path = `${prefix}/${label}-${randomUUID()}.${extension}`;
  const { error } = await admin.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error("portal: upload failed", error.message.slice(0, 120));
    return { message: "We could not save that file. Please try again." };
  }
  return { path };
}

export async function saveLicence(token: string, number: string, state: string, expires: string, photo: File | null): Promise<Call> {
  const lookup = await loadPortal(token);
  if (lookup.kind !== "ok") return { error: { code: "P0001", message: "This link has expired. Ask your brokerage for a new one." } };
  let path: string | null = null;
  if (photo && photo.size > 0) {
    const stored = await storeUpload(lookup.state.upload_prefix, "licence", photo);
    if ("message" in stored) return { error: { code: "P0001", message: stored.message } };
    path = stored.path;
  }
  return call(token, "portal_save_licence", { licence_no: number, licence_st: state, expires, file_path: path });
}

// ------------------------------------------------------------ the packet --

export type PacketItem = {
  id: string;
  title: string;
  kind: "sign" | "acknowledge" | "upload" | "outside" | "bank";
  body: string | null;
  required: boolean;
  has_file: boolean;
  done: boolean;
  done_at: string | null;
};

export async function loadPacket(token: string): Promise<PacketItem[]> {
  if (!TOKEN_PATTERN.test(token)) return [];
  const admin = client();
  if (!admin) return [];
  const { data, error } = await admin.rpc("portal_packet", { token_hash: hashToken(token) });
  if (error || !Array.isArray(data)) return [];
  return data as PacketItem[];
}

export type BankDetails = { name: string; type: string; last4: string };

/** The fingerprint of the brokerage's document for an item, taken at the moment of signing. */
async function itemFileHash(token: string, item: string): Promise<string | null> {
  const admin = client();
  if (!admin) return null;
  const { data: path } = await admin.rpc("portal_item_file", { token_hash: hashToken(token), item });
  if (typeof path !== "string" || !path) return null;
  const { data } = await admin.storage.from("documents").download(path);
  if (!data) return null;
  return createHash("sha256").update(Buffer.from(await data.arrayBuffer())).digest("hex");
}

export async function completeItem(
  token: string, item: string, typedName: string, agreed: boolean, file: File | null,
  proof: Evidence, bank: BankDetails | null,
): Promise<Call> {
  const lookup = await loadPortal(token);
  if (lookup.kind !== "ok") return { error: { code: "P0001", message: "This link has expired. Ask your brokerage for a new one." } };
  const kind = (await loadPacket(token)).find((entry) => entry.id === item)?.kind;
  let path: string | null = null;
  if (file && file.size > 0 && kind === "upload") {
    const stored = await storeUpload(lookup.state.upload_prefix, "paperwork", file);
    if ("message" in stored) return { error: { code: "P0001", message: stored.message } };
    path = stored.path;
  }
  return call(token, "portal_complete_item", {
    item, typed_name: typedName, agreed, file_path: path,
    consent_text: kind === "acknowledge" ? ACK_TEXT : consentText(lookup.state.brokerage),
    ip: proof.ip, agent_string: proof.userAgent, file_hash: await itemFileHash(token, item),
    bank: bank?.name ?? null, bank_type: bank?.type ?? null, bank_last4: bank?.last4 ?? null,
  });
}

/** Everything this agent has signed or acknowledged. */
export async function loadSignatures(token: string): Promise<SignatureRecord[]> {
  if (!TOKEN_PATTERN.test(token)) return [];
  const admin = client();
  if (!admin) return [];
  const { data, error } = await admin.rpc("portal_signatures", { token_hash: hashToken(token) });
  if (error || !Array.isArray(data)) return [];
  return data as SignatureRecord[];
}

/** The agent's own copy of one thing they signed, as a PDF. */
export async function signedCopy(token: string, signatureId: string): Promise<{ bytes: Uint8Array; name: string } | null> {
  const record = (await loadSignatures(token)).find((entry) => entry.id === signatureId);
  const admin = client();
  if (!record || !admin) return null;
  let original: Uint8Array | null = null;
  if (record.file_path?.endsWith(".pdf")) {
    const { data } = await admin.storage.from("documents").download(record.file_path);
    if (data) original = new Uint8Array(await data.arrayBuffer());
  }
  return { bytes: await signedRecordPdf(record, record.brokerage ?? "", original), name: `${record.title} - signed` };
}

/** A one-minute link to the brokerage's document for one packet item, for this agent only. */
export async function packetFileUrl(token: string, item: string): Promise<string | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const admin = client();
  if (!admin) return null;
  const { data: path } = await admin.rpc("portal_item_file", { token_hash: hashToken(token), item });
  if (typeof path !== "string" || !path) return null;
  const { data } = await admin.storage.from("documents").createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}
