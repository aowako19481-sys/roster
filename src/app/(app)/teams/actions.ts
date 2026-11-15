"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { done, fail, failure, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

function refresh(agentId?: string) {
  revalidatePath("/teams");
  revalidatePath("/agents");
  if (agentId) revalidatePath(`/agents/${agentId}`);
}

/** The brokerage's own limit on how many teams one agent may be on (one unless changed in Settings). */
async function teamLimitReached(supabase: Db, ws: string, agent: string) {
  const [{ data: settings }, { count }] = await Promise.all([
    supabase.from("workspaces").select("max_teams_per_agent").eq("id", ws).maybeSingle(),
    supabase.from("team_members").select("team_id", { count: "exact", head: true }).eq("workspace_id", ws).eq("agent_id", agent),
  ]);
  const max = Number(settings?.max_teams_per_agent ?? 1) || 1;
  return (count ?? 0) >= max ? max : null;
}

/** The agent list shows a team label; keep it in step. Skipped quietly if this person cannot edit agents. */
async function syncLabel(supabase: Db, ws: string, agent: string) {
  const { data: rows } = await supabase.from("team_members").select("team_id").eq("workspace_id", ws).eq("agent_id", agent);
  const ids = (rows ?? []).map((row) => row.team_id as string);
  const { data: teams } = ids.length
    ? await supabase.from("teams").select("name").eq("workspace_id", ws).in("id", ids).order("name")
    : { data: [] as { name: string }[] };
  const label = (teams ?? []).map((team) => team.name as string).join(", ") || null;
  await supabase.from("agents").update({ team_label: label }).eq("id", agent).eq("workspace_id", ws);
}

export async function createTeam(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("teams.manage");
  if ("denied" in gate) return fail(gate.denied);
  const name = text(form, "name", 80);
  const lead = uuid(form, "lead");
  if (name.length < 2) return fail("Give the team a name.");
  if (!lead) return fail("Choose the team lead.");

  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  const { data: agent } = await supabase.from("agents").select("id").eq("id", lead).eq("workspace_id", ws).maybeSingle();
  if (!agent) return fail("Choose the team lead from the list.");
  const limit = await teamLimitReached(supabase, ws, lead);
  if (limit) return fail(`That agent is already on ${limit === 1 ? "a team" : `${limit} teams`}, which is the most this brokerage allows.`);

  const { data: team, error } = await supabase.from("teams").insert({ workspace_id: ws, name, lead_agent_id: lead }).select("id").single();
  if (error) return error.code === "23505" ? fail("There is already a team with that name.") : failure(error);
  const { error: memberError } = await supabase.from("team_members")
    .insert({ team_id: team.id, agent_id: lead, workspace_id: ws, parent_agent_id: null, role_label: "Team lead" });
  if (memberError) return failure(memberError);
  await syncLabel(supabase, ws, lead);
  refresh(lead);
  return done(`${name} created. Add its members next.`);
}

export async function addTeamMember(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("teams.manage");
  if ("denied" in gate) return fail(gate.denied);
  const teamId = uuid(form, "team");
  const agentId = uuid(form, "agent");
  const parentId = uuid(form, "parent");
  const role = text(form, "role", 40) || "Member";
  if (!teamId) return fail("That team could not be found.");
  if (!agentId) return fail("Choose an agent to add.");

  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  const [{ data: team }, { data: agent }, { data: members }] = await Promise.all([
    supabase.from("teams").select("id, lead_agent_id").eq("id", teamId).eq("workspace_id", ws).maybeSingle(),
    supabase.from("agents").select("id, status").eq("id", agentId).eq("workspace_id", ws).maybeSingle(),
    supabase.from("team_members").select("agent_id").eq("workspace_id", ws).eq("team_id", teamId),
  ]);
  if (!team) return fail("That team could not be found.");
  if (!agent) return fail("Choose an agent from the list.");
  if (agent.status === "exited") return fail("That agent has left the brokerage.");
  const inTeam = new Set((members ?? []).map((member) => member.agent_id as string));
  if (inTeam.has(agentId)) return fail("That agent is already on this team.");
  // Reports to the chosen person, or to the lead when nobody is chosen.
  const parent = parentId ?? (team.lead_agent_id as string | null);
  if (parent && !inTeam.has(parent)) return fail("“Reports to” must be someone already on this team.");
  const limit = await teamLimitReached(supabase, ws, agentId);
  if (limit) return fail(`That agent is already on ${limit === 1 ? "a team" : `${limit} teams`}, which is the most this brokerage allows.`);

  const { error } = await supabase.from("team_members")
    .insert({ team_id: teamId, agent_id: agentId, workspace_id: ws, parent_agent_id: parent, role_label: role });
  if (error) return failure(error);
  await syncLabel(supabase, ws, agentId);
  refresh(agentId);
  return done("Added to the team.");
}

export async function removeTeamMember(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("teams.manage");
  if ("denied" in gate) return fail(gate.denied);
  const teamId = uuid(form, "team");
  const agentId = uuid(form, "agent");
  if (!teamId || !agentId) return fail("That team member could not be found.");

  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  const [{ data: team }, { data: member }] = await Promise.all([
    supabase.from("teams").select("id, lead_agent_id").eq("id", teamId).eq("workspace_id", ws).maybeSingle(),
    supabase.from("team_members").select("agent_id, parent_agent_id").eq("workspace_id", ws).eq("team_id", teamId).eq("agent_id", agentId).maybeSingle(),
  ]);
  if (!team || !member) return fail("That team member could not be found.");
  if (team.lead_agent_id === agentId) return fail("The team lead cannot be removed from their own team.");

  // Anyone who reported to this person now reports to the person above them.
  const { error: moveError } = await supabase.from("team_members")
    .update({ parent_agent_id: (member.parent_agent_id as string | null) ?? (team.lead_agent_id as string | null) })
    .eq("workspace_id", ws).eq("team_id", teamId).eq("parent_agent_id", agentId);
  if (moveError) return failure(moveError);
  const { error } = await supabase.from("team_members").delete().eq("workspace_id", ws).eq("team_id", teamId).eq("agent_id", agentId);
  if (error) return failure(error);
  await syncLabel(supabase, ws, agentId);
  refresh(agentId);
  return done("Removed from the team.");
}
