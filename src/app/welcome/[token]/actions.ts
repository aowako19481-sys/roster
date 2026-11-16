"use server";

import { checkLicenceForLink } from "@/lib/licence-states";
import { revalidatePath } from "next/cache";
import { evidence } from "@/lib/esign";
import { completeItem, loadPortal, saveDetails, saveLicence, saveW9, signRider } from "@/lib/portal";
import { done, fail, failure, isoDate, text, uuid, type Result } from "@/lib/result";

const refresh = (token: string) => revalidatePath(`/welcome/${token}`);

export async function detailsStep(_prev: Result, form: FormData): Promise<Result> {
  const token = text(form, "token", 64);
  const { error } = await saveDetails(token, text(form, "full_name", 120), text(form, "phone", 30));
  if (error) return failure(error);
  refresh(token);
  return done();
}

export async function licenceStep(_prev: Result, form: FormData): Promise<Result> {
  const token = text(form, "token", 64);
  const expires = isoDate(form, "expires");
  if (!expires) return { ok: false, message: "Enter the expiry date on your licence." };
  if (form.get("agree") !== "on") return { ok: false, message: "Tick the box to confirm you understand your brokerage will verify your licence." };
  const photo = form.get("photo");
  const { error } = await saveLicence(token, text(form, "number", 30), text(form, "state", 2) || "NY", expires, photo instanceof File ? photo : null);
  if (error) return failure(error);
  // Where the state publishes its record, it is checked now. The agent is never held up by it.
  await checkLicenceForLink(token);
  refresh(token);
  return done();
}

export async function w9Step(_prev: Result, form: FormData): Promise<Result> {
  const token = text(form, "token", 64);
  const { error } = await saveW9(token, text(form, "legal_name", 160), text(form, "last4", 4));
  if (error) return failure(error);
  refresh(token);
  return done();
}

export async function riderStep(_prev: Result, form: FormData): Promise<Result> {
  const token = text(form, "token", 64);
  const lookup = await loadPortal(token);
  if (lookup.kind !== "ok") return fail("This link has expired. Ask your brokerage for a new one.");
  const { error } = await signRider(token, text(form, "typed_name", 120), form.get("consent") === "on", lookup.state.brokerage, await evidence());
  if (error) return failure(error);
  refresh(token);
  return done();
}

export async function packetStep(_prev: Result, form: FormData): Promise<Result> {
  const token = text(form, "token", 64);
  const item = uuid(form, "item");
  if (!item) return fail("Something went wrong. Reload the page and try again.");
  const file = form.get("file");
  // Only the last four digits are ever accepted; a longer number is refused, not trimmed.
  const last4 = text(form, "bank_last4", 30);
  if (last4 && !/^[0-9]{4}$/.test(last4)) return fail("Enter only the last four digits of the account number, not the whole number.");
  const bank = last4 ? { name: text(form, "bank_name", 80), type: text(form, "bank_type", 10), last4 } : null;
  const { error } = await completeItem(
    token, item, text(form, "typed_name", 120), form.get("agreed") === "on", file instanceof File ? file : null, await evidence(), bank,
  );
  if (error) return failure(error);
  refresh(token);
  return done();
}
