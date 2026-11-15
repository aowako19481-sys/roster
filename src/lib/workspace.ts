import "server-only";
import { cache } from "react";
import { createClient, getUser } from "@/lib/supabase/server";

export type Membership = {
  workspaceId: string;
  workspaceName: string;
  timezone: string;
  role: string;
  displayName: string;
  initials: string;
  waitingApprovals: number;
};

function nameFromEmail(email: string | undefined) {
  const local = (email ?? "").split("@")[0] ?? "";
  const words = local
    .replace(/[0-9]+/g, " ")
    .split(/[._\-+\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(" ") || "there";
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

/**
 * The signed-in user's workspace. Row-level security guarantees the query
 * only ever returns the user's own membership row.
 */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, display_name, workspaces ( name, timezone )")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("workspace: could not load membership", error.code);
    return null;
  }
  if (!data) return null;

  const workspace = Array.isArray(data.workspaces) ? data.workspaces[0] : data.workspaces;
  if (!workspace) return null;

  const { count } = await supabase
    .from("tier_approvals")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", data.workspace_id)
    .eq("status", "waiting");

  const displayName = data.display_name?.trim() || nameFromEmail(user.email);

  return {
    workspaceId: data.workspace_id,
    workspaceName: workspace.name,
    timezone: workspace.timezone,
    role: data.role,
    displayName,
    initials: initialsOf(displayName) || "?",
    waitingApprovals: count ?? 0,
  };
});
