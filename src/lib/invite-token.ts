import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * A private onboarding link. The token goes in the link and is shown once;
 * only its hash is stored, so a copy of the database cannot be used to open
 * anyone's onboarding.
 */
export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The onboarding page for a token. `origin` comes from the request, e.g. https://kinu.example */
export function portalLink(origin: string, token: string) {
  return `${origin}/welcome/${token}`;
}
