// Names for roles and permissions. What each role may actually DO is decided
// in the database (supabase/migrations/0003_foundation.sql), not here.

export const CAPS = [
  "agents.view", "agents.edit", "agents.invite", "splits.view", "riders.manage", "tiers.approve", "w9.view",
  "files.view", "files.manage", "teams.manage", "deals.view", "deals.edit", "deals.hold", "payments.manage",
  "payroll.manage", "payroll.release", "override", "payouts.view", "statements.view", "members.manage",
  "settings.manage", "audit.view", "reports.view",
] as const;
export type Cap = (typeof CAPS)[number];

export const BUILT_IN_ROLES = [
  "owner_admin", "finance_manager", "finance_staff", "ops_manager", "ops_staff", "sales_manager", "auditor",
] as const;
export type BuiltInRole = (typeof BUILT_IN_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  owner_admin: "Owner / Admin",
  finance_manager: "Finance manager",
  finance_staff: "Finance staff",
  ops_manager: "Ops manager",
  ops_staff: "Ops staff",
  sales_manager: "Sales manager",
  auditor: "Auditor (read-only)",
  kinu_staff: "Kinu staff",
};

export function roleLabel(role: string | null | undefined) {
  if (!role) return "No role";
  return ROLE_LABELS[role] ?? role;
}

/** Wording for the custom-role checklist. Big powers are not in this list on purpose. */
export const CAP_GROUPS: { title: string; caps: { cap: Cap; label: string }[] }[] = [
  {
    title: "Can see",
    caps: [
      { cap: "agents.view", label: "Agents" },
      { cap: "splits.view", label: "Splits and riders" },
      { cap: "w9.view", label: "W-9 details" },
      { cap: "files.view", label: "Files and proofs" },
      { cap: "deals.view", label: "Deals" },
      { cap: "payouts.view", label: "Payouts" },
      { cap: "statements.view", label: "Agent statements" },
      { cap: "reports.view", label: "Reports" },
      { cap: "audit.view", label: "Audit log" },
    ],
  },
  {
    title: "Can do",
    caps: [
      { cap: "agents.invite", label: "Invite agents" },
      { cap: "agents.edit", label: "Edit agents" },
      { cap: "riders.manage", label: "Draft riders and verify documents" },
      { cap: "teams.manage", label: "Manage teams" },
      { cap: "files.manage", label: "Add and manage files" },
      { cap: "deals.edit", label: "Enter and edit deals" },
      { cap: "deals.hold", label: "Hold and clear deals" },
      { cap: "tiers.approve", label: "Approve tiers" },
      { cap: "payments.manage", label: "Record payments" },
      { cap: "payroll.manage", label: "Run payroll cutoff and close" },
      { cap: "members.manage", label: "Manage people and roles" },
      { cap: "settings.manage", label: "Change brokerage settings" },
    ],
  },
];

const FINANCE_CAPS: Cap[] = [
  "deals.view", "deals.edit", "deals.hold", "payments.manage", "payroll.manage", "payroll.release",
  "payouts.view", "statements.view", "override",
];
export function productOfCap(cap: Cap): "finance" | "ops" | "any" {
  if (FINANCE_CAPS.includes(cap)) return "finance";
  if (["agents.edit", "agents.invite", "riders.manage", "teams.manage", "files.manage"].includes(cap)) return "ops";
  return "any";
}
