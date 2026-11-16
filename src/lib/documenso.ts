import "server-only";

/**
 * Talks to the brokerage platform's own Documenso (self-hosted, at the address
 * in DOCUMENSO_URL) with a server-only API key. Nothing here ever reaches the
 * browser. Only the signer's name and email and the document itself are sent.
 */
const config = () => {
  const url = (process.env.DOCUMENSO_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.DOCUMENSO_API_KEY ?? "").trim();
  return /^https?:\/\/[^/]+$/.test(url) && key ? { url, key } : null;
};

export const documensoReady = () => config() !== null;

/** A problem we can show to staff in plain words. */
export class SigningError extends Error {}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const c = config();
  if (!c) throw new SigningError("Electronic signing is not switched on yet. Ask Kinu to finish the signing setup.");
  let res: Response;
  try {
    res = await fetch(`${c.url}/api/v2${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${c.key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new SigningError("The signing service did not answer. Please try again in a moment.");
  }
  if (res.ok) return res;
  let detail = "";
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === "string") detail = body.message.slice(0, 160);
  } catch { /* not JSON */ }
  console.error("documenso:", path.split("?")[0], res.status, detail);
  if (res.status === 401 || res.status === 403) throw new SigningError("The signing service refused Kinu's key. Ask Kinu to check the signing setup.");
  throw new SigningError(detail ? `The signing service could not do that: ${detail}` : "The signing service could not do that. Please try again.");
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** A box on a page, in percent of the page from its top-left corner. */
export type Box = { page: number; x: number; y: number; width: number; height: number };

/** Creates the document with one signer and their three boxes, then emails it to them. */
export async function sendForSignature(input: {
  title: string; pdf: Uint8Array; signer: { name: string; email: string }; reference: string;
  boxes: { signature: Box; name: Box; date: Box }; subject: string; message: string;
}): Promise<string> {
  const field = (type: string, box: Box) => ({ type, page: box.page, positionX: box.x, positionY: box.y, width: box.width, height: box.height });
  const form = new FormData();
  form.append("payload", JSON.stringify({
    title: input.title.slice(0, 250),
    type: "DOCUMENT",
    externalId: input.reference.slice(0, 250),
    recipients: [{
      email: input.signer.email, name: input.signer.name.slice(0, 250), role: "SIGNER",
      fields: [field("SIGNATURE", input.boxes.signature), field("NAME", input.boxes.name), field("DATE", input.boxes.date)],
    }],
  }));
  form.append("files", new Blob([input.pdf as BlobPart], { type: "application/pdf" }), "rider.pdf");
  const made = (await (await call("/envelope/create", { method: "POST", body: form })).json()) as { id?: unknown };
  if (typeof made.id !== "string" || !made.id) throw new SigningError("The signing service did not confirm the document. Please try again.");
  try {
    await call("/envelope/distribute", json({ envelopeId: made.id, meta: { subject: input.subject.slice(0, 250), message: input.message.slice(0, 4000), distributionMethod: "EMAIL" } }));
  } catch (error) {
    // Do not leave a half-made document behind.
    await call("/envelope/delete", json({ envelopeId: made.id })).catch(() => {});
    throw error;
  }
  return made.id;
}

export type EnvelopeState = { status: "sent" | "opened" | "signed" | "declined" | "cancelled"; itemId: string | null; waiting: number[] };

type Envelope = {
  status?: string; externalId?: string | null;
  recipients?: { id?: number; signingStatus?: string; readStatus?: string; role?: string }[];
  envelopeItems?: { id?: string; order?: number }[];
};

/** Reads where a document stands. `reference` must match what we sent, so one request can never read another's document. */
export async function envelopeState(envelopeId: string, reference: string): Promise<EnvelopeState> {
  const env = (await (await call(`/envelope/${encodeURIComponent(envelopeId)}`)).json()) as Envelope;
  if ((env.externalId ?? "") !== reference) throw new SigningError("That document does not belong to this request.");
  const signers = (env.recipients ?? []).filter((r) => r.role === "SIGNER");
  const item = [...(env.envelopeItems ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  const waiting = signers.filter((r) => r.signingStatus === "NOT_SIGNED" && typeof r.id === "number").map((r) => r.id as number);
  const status: EnvelopeState["status"] =
    env.status === "COMPLETED" ? "signed"
    : env.status === "REJECTED" || signers.some((r) => r.signingStatus === "REJECTED") ? "declined"
    : env.status === "CANCELLED" ? "cancelled"
    : signers.some((r) => r.readStatus === "OPENED") ? "opened" : "sent";
  return { status, itemId: typeof item?.id === "string" ? item.id : null, waiting };
}

/** Turns a download answer into the PDF's bytes, whichever way the service sends it. */
async function pdfBytes(res: Response): Promise<Uint8Array> {
  const type = res.headers.get("content-type") ?? "";
  let bytes: Uint8Array;
  if (type.includes("json")) {
    const body = (await res.json()) as { downloadUrl?: unknown; url?: unknown; data?: unknown };
    const link = typeof body.downloadUrl === "string" ? body.downloadUrl : typeof body.url === "string" ? body.url : null;
    if (link && /^https:\/\//.test(link)) bytes = new Uint8Array(await (await fetch(link, { cache: "no-store", signal: AbortSignal.timeout(25_000) })).arrayBuffer());
    else if (typeof body.data === "string") bytes = new Uint8Array(Buffer.from(body.data, "base64"));
    else throw new SigningError("The signed document could not be collected yet. Try again in a minute.");
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  // "%PDF" and a sensible size: never store something that is not the document.
  if (bytes.length < 200 || bytes.length > 25 * 1024 * 1024 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
    throw new SigningError("The signed document could not be collected yet. Try again in a minute.");
  }
  return bytes;
}

export async function downloadSigned(itemId: string): Promise<Uint8Array> {
  return pdfBytes(await call(`/envelope/item/${encodeURIComponent(itemId)}/download?version=signed`));
}

/** The signing certificate (who, when, from where). Not every setup produces one, so a miss is not an error. */
export async function downloadCertificate(envelopeId: string): Promise<Uint8Array | null> {
  try {
    return await pdfBytes(await call(`/envelope/${encodeURIComponent(envelopeId)}/certificate/download`));
  } catch {
    return null;
  }
}

export async function cancelEnvelope(envelopeId: string): Promise<void> {
  await call("/envelope/cancel", json({ envelopeId, reason: "Cancelled by the brokerage" }));
}

export async function remind(envelopeId: string, recipients: number[]): Promise<void> {
  if (recipients.length) await call("/envelope/redistribute", json({ envelopeId, recipients }));
}
