"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { PAYMENT_METHOD_VALUES, toCents } from "@/lib/finance";
import { done, fail, failure, isoDate, num, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

export type PaymentState = Result & { duplicate?: boolean };

const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const MAX_PARTS = 30;

/** Works out what a file really is from its first bytes, not from what the browser says. */
function sniff(bytes: Uint8Array): { type: string; ext: string } | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { type: "application/pdf", ext: "pdf" };
  if (starts(0xff, 0xd8, 0xff)) return { type: "image/jpeg", ext: "jpg" };
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { type: "image/png", ext: "png" };
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { type: "image/webp", ext: "webp" };
  }
  return null;
}

function safeName(name: string, ext: string) {
  const base = name.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "proof";
  return `${base}.${ext}`;
}

export async function recordPayment(_prev: PaymentState, form: FormData): Promise<PaymentState> {
  const gate = await actionAccess("payments.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;

  const method = text(form, "method", 10);
  const amountRaw = num(form, "amount");
  const received = isoDate(form, "received_on");
  const reference = text(form, "reference", 80);
  if (!PAYMENT_METHOD_VALUES.includes(method)) return fail("Choose check, wire or Hyfin.");
  if (amountRaw === null || amountRaw <= 0 || amountRaw > 9_999_999_999) return fail("Enter the payment amount, more than zero.");
  if (!received) return fail("Enter the date the payment was received.");
  const amount = toCents(amountRaw);

  const parts: { deal_id: string; amount: number }[] = [];
  for (let i = 0; i < MAX_PARTS; i += 1) {
    if (!form.has(`alloc${i}_deal`)) continue;
    const dealId = uuid(form, `alloc${i}_deal`);
    const part = num(form, `alloc${i}_amount`);
    if (!dealId && part === null) continue;
    if (!dealId) return fail("Choose a deal, by address, for every part of the payment.");
    if (part === null || part <= 0) return fail("Enter an amount of more than zero for every part.");
    if (parts.some((p) => p.deal_id === dealId)) return fail("The same deal is listed twice. Put it on one line.");
    parts.push({ deal_id: dealId, amount: toCents(part) });
  }
  if (parts.length === 0) return fail("Choose at least one deal this payment is for.");
  const partTotal = toCents(parts.reduce((sum, p) => sum + p.amount, 0));
  if (partTotal !== amount) {
    return fail(`The parts add up to $${partTotal.toFixed(2)} but the payment is $${amount.toFixed(2)}. They must match.`);
  }

  // Proof: PDF or image only, 10 MB at most, checked here on the server.
  const upload = form.get("proof");
  let proof: { bytes: Uint8Array; type: string; name: string } | null = null;
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_PROOF_BYTES) return fail("The proof is larger than 10 MB.");
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) return fail("The proof must be a PDF, JPEG, PNG or WebP file.");
    proof = { bytes, type: kind.type, name: safeName(upload.name, kind.ext) };
  }

  const supabase = await createClient();
  const { data: known } = await supabase.from("deals").select("id").eq("workspace_id", ws).in("id", parts.map((p) => p.deal_id));
  if ((known?.length ?? 0) !== parts.length) return fail("One of those deals could not be found.");

  // The same payment twice is a question, not an error.
  if (form.get("confirm_duplicate") !== "yes") {
    let query = supabase.from("payments").select("id").eq("workspace_id", ws).eq("method", method).eq("amount", amount).eq("received_on", received);
    query = reference ? query.eq("reference", reference) : query.is("reference", null);
    const { data: same } = await query.limit(1);
    if (same?.length) {
      return {
        ok: false,
        duplicate: true,
        message: "A payment with the same method, amount, date and reference is already on file. Is this a dual (a second, separate payment)?",
      };
    }
  }

  let proofPath: string | null = null;
  if (proof) {
    proofPath = `${ws}/payments/${crypto.randomUUID()}-${proof.name}`;
    const { error } = await supabase.storage.from("documents").upload(proofPath, proof.bytes, { contentType: proof.type, upsert: false });
    if (error) {
      console.error("payments: proof upload failed", error.message.slice(0, 200));
      return fail("The proof could not be uploaded. Nothing was saved. Please try again.");
    }
  }

  const { error } = await supabase.rpc("record_payment", {
    ws, pay_method: method, pay_amount: amount, pay_date: received, pay_reference: reference, allocations: parts, proof: proofPath,
  });
  if (error) return failure(error);

  revalidatePath("/payments");
  revalidatePath("/finance");
  for (const part of parts) revalidatePath(`/deals/${part.deal_id}`);
  return done("Payment recorded.");
}
