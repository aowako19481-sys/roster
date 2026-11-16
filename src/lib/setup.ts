import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;
export type SetupStep = { title: string; why: string; doneNote: string; href: string; action: string; done: boolean; optional?: boolean };

/**
 * What a brokerage sets up once, read from what is actually on file, so the
 * list is always true and never needs ticking by hand.
 */
export async function setupSteps(supabase: Db, ws: string, hasFinance: boolean, signingOn: boolean): Promise<SetupStep[]> {
  const count = async (table: string) => (await supabase.from(table).select("*", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;
  const templatesWhere = async (pack?: string) => {
    let query = supabase.from("sign_templates").select("*", { count: "exact", head: true }).eq("workspace_id", ws).eq("active", true);
    if (pack) query = query.eq("pack", pack);
    return (await query).count ?? 0;
  };
  const [offices, members, packet, templates, packs, lookups, agents, checklist, { data: workspace }, { data: rules }] = await Promise.all([
    count("offices"), count("workspace_members"), count("packet_items"), templatesWhere(), templatesWhere("invite"),
    count("licence_lookups"), count("agents"), count("checklist_items"),
    supabase.from("workspaces").select("payroll_weekdays, rider_template_path").eq("id", ws).maybeSingle(),
    supabase.from("automation").select("workspace_id").eq("workspace_id", ws).maybeSingle(),
  ]);
  const payDays = Array.isArray(workspace?.payroll_weekdays) ? (workspace.payroll_weekdays as unknown[]).length : 0;
  const steps: SetupStep[] = [
    { title: "Add your offices", why: "Every agent and deal belongs to an office.", doneNote: `${offices} on file.`, href: "/settings", action: "Add offices", done: offices > 0 },
    { title: "Invite your team and choose what each person can see", why: "Colleagues create their own password the first time they sign in.", doneNote: `${members} people have access.`, href: "/settings/people", action: "Invite people", done: members > 1 },
    { title: "Set the onboarding paperwork", why: "The list every new agent works through from their own phone.", doneNote: `${packet} items on the list.`, href: "/packet", action: "Set paperwork", done: packet > 0 },
    { title: "Upload your rider document", why: "It goes out with every rider, followed by a page with the agent’s own numbers.", doneNote: "On file.", href: "/riders", action: "Upload rider", done: Boolean(workspace?.rider_template_path), optional: true },
    { title: "Add the documents you need signed", why: signingOn ? "Kinu places the signing boxes; you check them once." : "Electronic signing is not switched on for Kinu yet.", doneNote: `${templates} ready to send.`, href: "/sign", action: "Add a document", done: templates > 0 },
    { title: "Choose your new-agent pack", why: "The documents that go out by themselves whenever an agent is invited.", doneNote: `${packs} in the pack.`, href: "/sign", action: "Choose the pack", done: packs > 0 },
    { title: "Set your starting tiers and what runs by itself", why: "Your own tiers, and which steps Kinu takes without being asked.", doneNote: "Saved.", href: "/settings/automation", action: "Set automation", done: Boolean(rules) },
    { title: "Save your state’s licence look-up", why: "Staff reach the state record in one click when confirming a licence.", doneNote: `${lookups} saved.`, href: "/settings/automation", action: "Save look-up", done: lookups > 0 },
  ];
  if (hasFinance) {
    steps.push(
      { title: "Set your pay days and cutoff time", why: "Payroll opens and runs its cutoff around these.", doneNote: `${payDays} pay day${payDays === 1 ? "" : "s"} a week.`, href: "/settings", action: "Set pay days", done: payDays > 0 },
      { title: "Make the deal checklist your own", why: "The boxes every new deal starts with, and which ones tick themselves.", doneNote: `${checklist} boxes.`, href: "/settings/checklist", action: "Set checklist", done: checklist > 0, optional: true },
    );
  }
  steps.push({ title: "Invite your first agent", why: "Everything above now happens for them automatically.", doneNote: `${agents} agents on file.`, href: "/invite", action: "Invite an agent", done: agents > 0 });
  return steps;
}
