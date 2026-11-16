import { requireCap } from "@/lib/access";
import { todayIso } from "@/lib/format";
import { csvResponse, statusWord, toCsv } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";

/**
 * Each agent's earnings for one calendar year, as a CSV for the brokerage's
 * accountant: what they were paid from payrolls closed in that year. It never
 * contains tax numbers. It is a summary to work from, not a tax filing.
 */
export async function GET(request: Request) {
  const access = await requireCap("reports.view");
  if (!access.caps.has("payouts.view") && !access.caps.has("statements.view")) return new Response("You are not allowed to export earnings.", { status: 403 });
  const thisYear = Number(todayIso(access.workspace.timezone).slice(0, 4));
  const asked = Number(new URL(request.url).searchParams.get("year"));
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= thisYear ? asked : thisYear;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("year_earnings", { ws: access.workspace.id, yr: year });
  if (error) return new Response("The export could not be made. Please try again.", { status: 500 });
  const rows = ((data ?? []) as { full_name: string; email: string | null; office: string | null; status: string; w9_status: string; deals_paid: number; total_paid: number | string }[]).map((row) => [
    row.full_name, row.email ?? "", row.office ?? "", statusWord("agent", row.status).label, statusWord("w9", row.w9_status).label, String(row.deals_paid), Number(row.total_paid).toFixed(2),
  ]);
  const total = rows.reduce((sum, row) => sum + Number(row[6]), 0);
  rows.push(["Total", "", "", "", "", String(rows.reduce((sum, row) => sum + Number(row[5]), 0)), total.toFixed(2)]);
  return csvResponse(`agent-earnings-${year}`, toCsv(["Agent", "Email", "Office", "Status", "W-9", "Deals paid", `Paid in ${year} ($)`], rows));
}
