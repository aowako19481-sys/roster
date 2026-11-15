"use server";

import { createHash } from "node:crypto";
import { COMPANY } from "@/lib/company";
import { evidence } from "@/lib/esign";
import { done, fail, text, type Result } from "@/lib/result";
import { createAdminClient } from "@/lib/supabase/admin";

const AGENT_BANDS = ["Under 50", "50 to 200", "200 to 600", "Over 600"];
const fallback = () =>
  COMPANY.contactEmail ? `We could not send that just now. Please email ${COMPANY.contactEmail}.` : "We could not send that just now. Please try again in a little while.";

/**
 * The public "Get started" form. The visitor is not signed in, so the server
 * hands the message to one database function that checks it and limits how
 * many can arrive. The visitor's address is only kept as a one-way
 * fingerprint, to enforce that limit.
 */
export async function sendLead(_prev: Result, form: FormData): Promise<Result> {
  // A field people never see. Only automated form-fillers complete it.
  if (text(form, "website", 200)) return done("Thank you. We will be in touch.");

  const name = text(form, "name", 120);
  const company = text(form, "company", 160);
  const email = text(form, "email", 254).toLowerCase();
  const agents = text(form, "agents", 40);
  if (name.length < 2) return fail("Tell us your name.");
  if (company.length < 2) return fail("Tell us the name of your brokerage.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("That email address does not look right.");

  const admin = createAdminClient();
  if (!admin) return fail(fallback());
  const { ip } = await evidence();
  const sender = createHash("sha256").update(`kinu-lead:${ip ?? "unknown"}`).digest("hex");
  const { data, error } = await admin.rpc("submit_lead", {
    lead_name: name,
    lead_company: company,
    lead_email: email,
    lead_agents: AGENT_BANDS.includes(agents) ? agents : "",
    lead_plan: text(form, "plan", 200),
    lead_message: text(form, "message", 2000),
    sender,
  });
  if (error) {
    console.error("lead: failed", error.code);
    return fail(fallback());
  }
  if (data === "busy") return fail("We have had several messages from this connection already. Please try again in an hour.");
  if (data !== "ok") return fail("Please check your details and try again.");
  return done("Thank you. A person from the team will reply, usually within one working day.");
}
