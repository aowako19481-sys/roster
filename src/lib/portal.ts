import "server-only";
import { randomUUID } from "node:crypto";
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

export const signRider = (token: string, typedName: string, consent: boolean) =>
  call(token, "portal_sign_rider", { typed_name: typedName, consent, signer_note: "E-signature · typed name and consent" });

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function saveLicence(token: string, number: string, state: string, expires: string, photo: File | null): Promise<Call> {
  const lookup = await loadPortal(token);
  if (lookup.kind !== "ok") return { error: { code: "P0001", message: "This link has expired. Ask your brokerage for a new one." } };

  let path: string | null = null;
  if (photo && photo.size > 0) {
    const extension = PHOTO_TYPES[photo.type];
    if (!extension) return { error: { code: "P0001", message: "Upload a photo (JPEG, PNG, WebP) or a PDF." } };
    if (photo.size > MAX_PHOTO_BYTES) return { error: { code: "P0001", message: "That file is larger than 10 MB." } };
    const admin = client();
    if (!admin) return { error: { code: "P0001", message: "Onboarding is not switched on yet." } };
    // The name is ours, not the visitor's: brokerage/agent folder + a random id.
    path = `${lookup.state.upload_prefix}/licence-${randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from("documents").upload(path, photo, { contentType: photo.type, upsert: false });
    if (uploadError) {
      console.error("portal: upload failed", uploadError.message.slice(0, 120));
      return { error: { code: "P0001", message: "We could not save that file. Please try again." } };
    }
  }
  return call(token, "portal_save_licence", { licence_no: number, licence_st: state, expires, file_path: path });
}
