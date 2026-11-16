import "server-only";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/company";

/**
 * Email that Kinu sends itself (reminders and summaries), through Resend with
 * a server-only key. Nothing is sent, and nothing fails, if the key is not set.
 */
const key = () => (process.env.RESEND_API_KEY ?? "").trim();
export const mailReady = () => key().length > 0;
// Resend's address. Only our own tests point this somewhere else.
const ENDPOINT = (process.env.RESEND_API_URL ?? "").trim() || "https://api.resend.com/emails";
const FROM = `${BRAND.toUpperCase()} <no-reply@${new URL(SITE_URL).hostname}>`;

const safe = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Letter = { to: string; subject: string; heading: string; lines: string[]; button?: { label: string; url: string }; from?: string };

/** One plain, branded email. Every piece of text is escaped; the button may only point at our own site. */
export function letterHtml(letter: Letter): string {
  const button = letter.button && letter.button.url.startsWith(`${SITE_URL}/`)
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px 0;"><tr><td style="background-color:#101113;border-radius:999px;"><a href="${safe(letter.button.url)}" style="display:inline-block;padding:14px 26px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#ffffff;text-decoration:none;">${safe(letter.button.label)}</a></td></tr></table>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safe(letter.subject)}</title></head>
<body style="margin:0;padding:0;background-color:#c9cacc;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#c9cacc;"><tr><td align="center" style="padding:36px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td align="center" style="padding:0 0 22px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:30px;letter-spacing:14px;color:#17181a;font-weight:200;">&nbsp;${safe(BRAND.toUpperCase())}</td></tr>
<tr><td style="background-color:#f1f1f2;border:1px solid #ffffff;border-bottom:6px solid #a9aaad;border-radius:22px;padding:32px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#17181a;">
<h1 style="margin:0 0 14px 0;font-size:24px;line-height:1.2;font-weight:300;">${safe(letter.heading)}</h1>
${letter.lines.map((line) => `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.55;color:#36373a;">${safe(line)}</p>`).join("")}
${button}
<p style="margin:20px 0 0 0;font-size:12px;line-height:1.5;color:#5d5f64;">${safe(letter.from ? `Sent by ${BRAND} for ${letter.from}.` : `Sent by ${BRAND}.`)} This address does not receive replies.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export async function sendLetter(letter: Letter): Promise<boolean> {
  if (!mailReady() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(letter.to)) return false;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [letter.to], subject: letter.subject.slice(0, 200), html: letterHtml(letter), text: [letter.heading, ...letter.lines, letter.button?.url ?? ""].filter(Boolean).join("\n\n") }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.error("mail: not sent", res.status);
    return res.ok;
  } catch {
    console.error("mail: not sent");
    return false;
  }
}
