import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { BUILT_IN_ROLES, CAPS, type Cap } from "@/lib/roles";
import { createClient, getUser } from "@/lib/supabase/server";

export const WORKSPACE_COOKIE = "kinu_ws";
export const VIEW_AS_COOKIE = "kinu_as";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Workspace = {
  id: string;
  name: string;
  timezone: string;
  hasOps: boolean;
  hasFinance: boolean;
  addons: string[];
  status: string;
};

export type Access = {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  /** Kinu's founder: sees the founder console. Other Kinu staff get the standard one. */
  isFounder: boolean;
  /** The brokerage being looked at, or null if the person belongs to none. */
  workspace: Workspace | null;
  workspaces: { id: string; name: string }[];
  /** The person's real role in this brokerage. */
  role: string | null;
  /** Set when an owner or Kinu staff is previewing another role. */
  viewAs: string | null;
  /** What the person may do right now (the previewed role's permissions while previewing). */
  caps: Set<Cap>;
  displayName: string;
  initials: string;
};

type RawAccess = {
  is_platform_admin: boolean;
  workspace: { id: string; name: string; timezone: string; has_ops: boolean; has_finance: boolean; addons: string[]; status: string } | null;
  role: string | null;
  display_name: string | null;
  caps: string[];
  workspaces: { id: string; name: string }[];
};

function nameFromEmail(email: string | undefined) {
  const local = (email ?? "").split("@")[0] ?? "";
  const words = local.replace(/[0-9]+/g, " ").split(/[._\-+\s]+/).filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(" ") || "there";
}

export function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase()).slice(0, 2).join("");
}

/**
 * Who is signed in and what they may do, asked of the database once per
 * request. The database is the authority: this only reports its answer.
 */
export const getAccess = cache(async (): Promise<Access | null> => {
  const user = await getUser();
  if (!user) return null;

  const jar = await cookies();
  const wanted = jar.get(WORKSPACE_COOKIE)?.value;
  const supabase = await createClient();

  const load = async () => {
    const { data, error } = await supabase.rpc("my_access", { ws: wanted && UUID.test(wanted) ? wanted : null });
    if (error) {
      console.error("access: could not load", error.code);
      return null;
    }
    return data as RawAccess | null;
  };

  let raw = await load();
  // A cookie pointing at a brokerage this person cannot see falls back to their own.
  if (raw && !raw.workspace && wanted) {
    const { data } = await supabase.rpc("my_access", { ws: null });
    raw = (data as RawAccess | null) ?? raw;
  }
  // First sign-in after being invited: join the brokerage, then look again.
  if (raw && !raw.workspace) {
    const { data: joined } = await supabase.rpc("accept_my_invites");
    if (typeof joined === "number" && joined > 0) {
      const { data } = await supabase.rpc("my_access", { ws: null });
      raw = (data as RawAccess | null) ?? raw;
    }
  }
  if (!raw) return null;

  // Kinu staff start outside every brokerage, on the console. They are only
  // "inside" one after choosing to open it, and step back out when they leave.
  if (raw.is_platform_admin && !(wanted && UUID.test(wanted))) {
    raw = { ...raw, workspace: null, role: null, caps: [] };
  }

  let caps = new Set(raw.caps.filter((cap): cap is Cap => (CAPS as readonly string[]).includes(cap)));
  let viewAs: string | null = null;
  const previewRole = jar.get(VIEW_AS_COOKIE)?.value;
  const mayPreview = raw.is_platform_admin || raw.role === "owner_admin";
  if (raw.workspace && mayPreview && previewRole && (BUILT_IN_ROLES as readonly string[]).includes(previewRole)) {
    const { data } = await supabase.rpc("role_preview", { ws: raw.workspace.id, role: previewRole });
    if (Array.isArray(data)) {
      caps = new Set((data as string[]).filter((cap): cap is Cap => (CAPS as readonly string[]).includes(cap)));
      viewAs = previewRole;
    }
  }

  let isFounder = false;
  if (raw.is_platform_admin) {
    const { data: consoleRole } = await supabase.rpc("console_role");
    isFounder = consoleRole === "founder";
  }

  const displayName = raw.display_name?.trim() || nameFromEmail(user.email);
  return {
    userId: user.id,
    email: user.email ?? "",
    isPlatformAdmin: raw.is_platform_admin,
    isFounder,
    workspace: raw.workspace
      ? {
          id: raw.workspace.id,
          name: raw.workspace.name,
          timezone: raw.workspace.timezone,
          hasOps: raw.workspace.has_ops,
          hasFinance: raw.workspace.has_finance,
          addons: raw.workspace.addons ?? [],
          status: raw.workspace.status,
        }
      : null,
    workspaces: raw.workspaces ?? [],
    role: raw.role,
    viewAs,
    caps,
    displayName,
    initials: initialsOf(displayName) || "?",
  };
});

export type WorkspaceAccess = Access & { workspace: Workspace };

/** For pages inside a brokerage. Sends the visitor somewhere sensible if they have none. */
export async function requireWorkspace(): Promise<WorkspaceAccess> {
  const access = await getAccess();
  if (!access) redirect("/sign-in");
  if (!access.workspace) redirect(access.isPlatformAdmin ? "/kinu" : "/no-brokerage");
  return access as WorkspaceAccess;
}

/** For pages that need one permission. Anyone without it sees the locked page. */
export async function requireCap(cap: Cap): Promise<WorkspaceAccess> {
  const access = await requireWorkspace();
  if (!access.caps.has(cap)) redirect(`/locked?need=${encodeURIComponent(cap)}`);
  return access;
}

/** For pages that need an add-on as well as a permission. */
export async function requireAddon(addon: "retention" | "finance_shield" | "compliance", cap: Cap): Promise<WorkspaceAccess> {
  const access = await requireCap(cap);
  if (!access.workspace.addons.includes(addon)) redirect(`/locked?addon=${addon}`);
  return access;
}

export async function requirePlatformAdmin(): Promise<Access> {
  const access = await getAccess();
  if (!access) redirect("/sign-in");
  if (!access.isPlatformAdmin) redirect("/");
  return access;
}

/**
 * For server actions. Returns the access if the person may do this, or a
 * message to show. The database checks again whatever this says; this exists
 * so a previewed role behaves like the real thing and messages are friendly.
 */
export async function actionAccess(cap: Cap): Promise<{ access: WorkspaceAccess } | { denied: string }> {
  const access = await getAccess();
  if (!access || !access.workspace) return { denied: "Please sign in again." };
  if (!access.caps.has(cap)) {
    return {
      denied: access.viewAs
        ? "This role is not allowed to do that. (You are previewing a role; switch back to act as yourself.)"
        : "You are not allowed to do that.",
    };
  }
  if (access.viewAs) {
    return { denied: "You are previewing a role. Switch back to yourself to make changes." };
  }
  return { access: access as WorkspaceAccess };
}
