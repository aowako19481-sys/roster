import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_BYTES = 10 * 1024 * 1024;

function looksLike(type: string, head: Uint8Array) {
  const at = (i: number) => head[i] ?? -1;
  if (type === "application/pdf") return at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46;
  if (type === "image/png") return at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47;
  if (type === "image/jpeg") return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
  if (type === "image/webp") return at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45;
  return false;
}

/** A filename safe to show and to put in a download header. */
export function tidyName(name: string) {
  const clean = name.normalize("NFKD").replace(/[^A-Za-z0-9._ -]+/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return clean || "file";
}

/**
 * Checks an uploaded file (declared type, real first bytes, size) and stores
 * it in the brokerage's payments folder under a name we choose. The upload
 * runs as the signed-in user, so storage rules decide whether it is allowed.
 */
export async function storePaymentFile(
  supabase: SupabaseClient,
  workspaceId: string,
  file: File,
): Promise<{ path: string; name: string } | { message: string }> {
  const extension = TYPES[file.type];
  if (!extension) return { message: "Use a photo (JPEG, PNG, WebP) or a PDF." };
  if (file.size === 0) return { message: "That file is empty." };
  if (file.size > MAX_BYTES) return { message: "That file is larger than 10 MB." };
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!looksLike(file.type, head)) return { message: "That file is not a valid photo or PDF." };
  const path = `${workspaceId}/payments/${randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { message: "We could not store that file. Please try again." };
  return { path, name: tidyName(file.name) };
}

/**
 * Sends a stored file back through our own site, as the signed-in user (the
 * storage rules decide whether they may read it). Images open in the page;
 * anything else downloads. The response cannot run scripts.
 */
export async function sendStoredFile(supabase: SupabaseClient, path: string, filename: string): Promise<Response> {
  const { data, error } = await supabase.storage.from("documents").download(path);
  if (error || !data) return new Response("Not found", { status: 404 });
  const extension = path.split(".").pop() ?? "";
  const type = Object.entries(TYPES).find(([, ext]) => ext === extension)?.[0] ?? "application/octet-stream";
  const inline = type.startsWith("image/");
  return new Response(data, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${tidyName(filename)}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
