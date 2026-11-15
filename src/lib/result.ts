/** What every form action returns: null = nothing yet, true = done, false = show the message. */
export type Result = { ok: boolean | null; message?: string };

export const IDLE: Result = { ok: null };
export const done = (message?: string): Result => ({ ok: true, message });
export const fail = (message: string): Result => ({ ok: false, message });

type DbError = { code?: string; message?: string } | null | undefined;

/**
 * Turns a database error into something safe to show. Messages we wrote
 * ourselves in the database functions are shown as they are; anything else
 * becomes a plain sentence and the detail goes to the server log only.
 */
export function failure(error: DbError, fallback = "That did not work. Please try again."): Result {
  if (!error) return fail(fallback);
  const text = error.message ?? "";
  const ours = error.code === "P0001" || (error.code === "42501" && !/permission denied|row-level security/i.test(text));
  if (ours && text.length > 0 && text.length < 240) return fail(text);
  if (error.code === "42501") return fail("You are not allowed to do that.");
  if (error.code === "23505") return fail("That already exists.");
  if (error.code === "23503") return fail("That is still in use somewhere else, so it cannot be removed.");
  if (error.code === "23514" || error.code === "22P02" || error.code === "22003") return fail("One of the values is not valid. Check the form and try again.");
  console.error("db error", error.code, text.slice(0, 200));
  return fail(fallback);
}

/** Small readers for form fields, so every action validates the same way. */
export function text(form: FormData, name: string, max = 200): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function num(form: FormData, name: string): number | null {
  const raw = text(form, name, 40).replace(/[$,%\s]/g, "");
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
export function uuid(form: FormData, name: string): string | null {
  const value = text(form, name, 40);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
export function isoDate(form: FormData, name: string): string | null {
  const value = text(form, name, 12);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}
