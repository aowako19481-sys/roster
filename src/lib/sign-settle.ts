import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { documentReference, riderReference } from "@/lib/automation";
import { SigningError, downloadCertificate, downloadSigned, envelopeState } from "@/lib/documenso";

/**
 * Reads what is out for signature back from the signing service and records
 * the result: the signed copy and its certificate are stored and filed, and a
 * rider becomes current when everyone asked has signed. Used when staff have
 * a page open (as that person) and by our own server on a timer.
 */
type Db = SupabaseClient;
export type Settled = { checked: number; signed: number; declined: number; trouble: number };
type RiderRow = { id: string; workspace_id: string; rider_id: string; agent_id: string; envelope_id: string; status: string };
type DocRow = { id: string; workspace_id: string; envelope_id: string; status: string; signers: { email: string; status: string }[] };

async function keep(db: Db, path: string, pdf: Uint8Array) {
  const stored = await db.storage.from("documents").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  return !stored.error;
}

async function settleRider(db: Db, row: RiderRow): Promise<string> {
  const ws = row.workspace_id;
  const state = await envelopeState(row.envelope_id, riderReference(ws, row.rider_id, row.agent_id));
  if (state.status === row.status) return state.status;
  let signedPath: string | null = null, certificatePath: string | null = null;
  if (state.status === "signed") {
    if (!state.itemId) throw new SigningError("not ready");
    signedPath = `${ws}/riders/${row.id}-signed.pdf`;
    if (!(await keep(db, signedPath, await downloadSigned(state.itemId)))) throw new SigningError("not saved");
    const certificate = await downloadCertificate(row.envelope_id);
    if (certificate && (await keep(db, `${ws}/riders/${row.id}-certificate.pdf`, certificate))) certificatePath = `${ws}/riders/${row.id}-certificate.pdf`;
  }
  const { data, error } = await db.rpc("update_sign_request", { ws, request: row.id, new_status: state.status, signed_file: signedPath, certificate_file: certificatePath });
  if (error) throw new SigningError("not recorded");
  return (data as string) ?? state.status;
}

async function settleDocument(db: Db, row: DocRow): Promise<string> {
  const ws = row.workspace_id;
  const state = await envelopeState(row.envelope_id, documentReference(ws));
  const states = row.signers.map((signer, index) => state.people.find((person) => person.email === signer.email)?.status ?? state.people[index]?.status ?? signer.status);
  if (state.status === row.status && states.every((status, index) => status === row.signers[index]!.status)) return state.status;
  let signedPath: string | null = null, certificatePath: string | null = null;
  if (state.status === "signed") {
    if (!state.itemId) throw new SigningError("not ready");
    signedPath = `${ws}/sign/${row.id}-signed.pdf`;
    if (!(await keep(db, signedPath, await downloadSigned(state.itemId)))) throw new SigningError("not saved");
    const certificate = await downloadCertificate(row.envelope_id);
    if (certificate && (await keep(db, `${ws}/sign/${row.id}-certificate.pdf`, certificate))) certificatePath = `${ws}/sign/${row.id}-certificate.pdf`;
  }
  const { data, error } = await db.rpc("update_sign_document", { ws, doc: row.id, new_status: state.status, signer_states: states, signed_file: signedPath, certificate_file: certificatePath });
  if (error) throw new SigningError("not recorded");
  return (data as string) ?? state.status;
}

async function run<T>(rows: T[], one: (row: T) => Promise<string>): Promise<Settled> {
  const out: Settled = { checked: rows.length, signed: 0, declined: 0, trouble: 0 };
  for (const row of rows) {
    try {
      const result = await one(row);
      if (result === "signed" || result === "rider_signed") out.signed += 1;
      if (result === "declined") out.declined += 1;
    } catch {
      out.trouble += 1;
    }
  }
  return out;
}

/** Riders out for signature. `ws` limits it to one brokerage; without it, every brokerage (our server only). */
export async function settleRiders(db: Db, ws: string | null, limit = 40): Promise<Settled> {
  let query = db.from("sign_requests").select("id, workspace_id, rider_id, agent_id, envelope_id, status").in("status", ["sent", "opened"]).order("sent_at").limit(limit);
  if (ws) query = query.eq("workspace_id", ws);
  const { data } = await query;
  return run((data ?? []) as RiderRow[], (row) => settleRider(db, row));
}

/** Documents out for signature. */
export async function settleDocuments(db: Db, ws: string | null, limit = 40): Promise<Settled> {
  let query = db.from("sign_documents").select("id, workspace_id, envelope_id, status, signers").in("status", ["sent", "opened"]).order("sent_at").limit(limit);
  if (ws) query = query.eq("workspace_id", ws);
  const { data } = await query;
  return run((data ?? []) as DocRow[], (row) => settleDocument(db, row));
}
