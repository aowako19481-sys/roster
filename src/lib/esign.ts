import "server-only";
import { headers } from "next/headers";

/**
 * Electronic signing. The wording the signer agrees to is kept here, in one
 * place, and saved word for word with every signature. Change the version
 * label whenever the wording changes.
 */
export const ESIGN_VERSION = "2026-11";

export function consentText(brokerage: string) {
  return (
    `Electronic signature disclosure (${ESIGN_VERSION}). I agree to use electronic records and signatures with ${brokerage}. ` +
    "I understand that typing my name and selecting Sign has the same legal effect as signing on paper. " +
    "I have been able to open and read this document on this device, and I can download a copy of what I sign from this page. " +
    `I may ask ${brokerage} for a paper copy, or choose to sign on paper instead, by contacting ${brokerage} before I sign.`
  );
}

export const ACK_TEXT = `Acknowledgement (${ESIGN_VERSION}). I confirm that I have read and understood this document.`;

export type Evidence = { ip: string | null; userAgent: string | null };

/** Where the request came from, as reported by our own hosting. */
export async function evidence(): Promise<Evidence> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  const ip = forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}
