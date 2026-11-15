import { requireCap } from "@/lib/access";
import { todayIso } from "@/lib/format";
import { csvResponse, statusWord, toCsv } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";

/**
 * Downloads the agent roster as a CSV. It never contains tax numbers (not
 * even the last four digits), licence numbers or splits.
 */
export async function GET() {
  const access = await requireCap("reports.view");
  if (!access.caps.has("agents.view")) return new Response("You are not allowed to export the roster.", { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("agents")
    .select("full_name, email, phone, office, team_label, status, cohort, joined_on, licence_status, licence_expires_on, w9_status, rider_status, onboarding_status")
    .eq("workspace_id", access.workspace.id).order("full_name").limit(5000);
  if (error) return new Response("The export could not be made. Please try again.", { status: 500 });

  const rows = (data ?? []).map((agent) => [
    agent.full_name as string,
    (agent.email as string | null) ?? "",
    (agent.phone as string | null) ?? "",
    agent.office as string,
    (agent.team_label as string | null) ?? "",
    statusWord("agent", agent.status as string).label,
    (agent.cohort as string | null) ?? "",
    (agent.joined_on as string | null) ?? "",
    statusWord("licence", agent.licence_status as string).label,
    (agent.licence_expires_on as string | null) ?? "",
    statusWord("w9", agent.w9_status as string).label,
    statusWord("rider", agent.rider_status as string).label,
    String(agent.onboarding_status ?? "").replace(/_/g, " "),
  ]);
  const csv = toCsv(
    ["Name", "Email", "Phone", "Office", "Team", "Status", "Cohort", "Joined", "Licence", "Licence expires", "W-9", "Rider", "Onboarding"],
    rows,
  );
  return csvResponse(`agent-roster-${todayIso(access.workspace.timezone)}`, csv);
}
