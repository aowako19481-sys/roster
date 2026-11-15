"use server";

import { revalidatePath } from "next/cache";
import { saveDetails, saveLicence, saveW9, signRider } from "@/lib/portal";
import { done, failure, isoDate, text, type Result } from "@/lib/result";

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
  const photo = form.get("photo");
  const { error } = await saveLicence(token, text(form, "number", 30), text(form, "state", 2) || "NY", expires, photo instanceof File ? photo : null);
  if (error) return failure(error);
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
  const { error } = await signRider(token, text(form, "typed_name", 120), form.get("consent") === "on");
  if (error) return failure(error);
  refresh(token);
  return done();
}
