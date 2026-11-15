import type { NavGroups, NavItem } from "@/components/Dock";
import type { Access } from "@/lib/access";
import type { Cap } from "@/lib/roles";

const ICONS = {
  home: "M3 11 12 4l9 7v9h-6v-6H9v6H3z",
  agents: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  teams: "M12 3v5M5 13v-2h14v2M12 8v3M3 13h4v5H3zM10 13h4v5h-4zM17 13h4v5h-4z",
  riders: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4",
  files: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  reports: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  overview: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  deals: "M4 4h16v16H4zM4 9h16M9 9v11",
  payments: "M3 6h18v12H3zM3 10h18M7 15h3",
  payroll: "M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M8 14h3M13 14h3",
  calculator: "M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01",
  statements: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  retention: "M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M12 7v5l3 3",
  payouts: "M9 12l2 2 4-4M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  exit: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h11",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
};

/**
 * The navigation for this person in this brokerage. Pages they have no
 * permission for are left out. Products and add-ons the brokerage has not
 * bought are shown locked, as a preview.
 */
export function buildNav(access: Access): NavGroups {
  const ws = access.workspace;
  if (!ws) return { ops: [], finance: [], addons: [], admin: [] };
  const has = (cap: Cap) => access.caps.has(cap);
  const item = (href: string, label: string, icon: string, show: boolean, locked = false): NavItem | null =>
    show || locked ? { href, label, icon, locked } : null;
  const keep = (items: (NavItem | null)[]) => items.filter((entry): entry is NavItem => entry !== null);

  const ops = keep([
    item("/", "Home", ICONS.home, has("agents.view")),
    item("/agents", "Agents", ICONS.agents, has("agents.view")),
    item("/teams", "Teams", ICONS.teams, has("agents.view")),
    item("/riders", "Riders", ICONS.riders, has("splits.view")),
    item("/files", "Files", ICONS.files, has("files.view")),
    item("/reports", "Reports", ICONS.reports, has("reports.view")),
  ]);

  const financeLocked = !ws.hasFinance;
  const finance = keep([
    item("/finance", "Overview", ICONS.overview, has("deals.view"), financeLocked),
    item("/deals", "Deals", ICONS.deals, has("deals.view"), financeLocked),
    item("/payments", "Payments", ICONS.payments, has("deals.view"), financeLocked),
    item("/payroll", "Payroll", ICONS.payroll, has("deals.view"), financeLocked),
    item("/calculator", "Calculator", ICONS.calculator, has("deals.view"), financeLocked),
    item("/statements", "Statements", ICONS.statements, has("statements.view"), financeLocked),
  ]);

  const addon = (name: string) => ws.addons.includes(name);
  const addons = keep([
    item("/retention", "Retention", ICONS.retention, addon("retention") && has("reports.view"), !addon("retention") && has("reports.view")),
    item("/payouts", "Payout checks", ICONS.payouts, addon("finance_shield") && has("payouts.view"), !addon("finance_shield") && (has("payouts.view") || financeLocked)),
    item("/exit-kit", "Exit kit", ICONS.exit, addon("retention") && has("agents.view"), !addon("retention") && has("agents.view")),
  ]);

  const admin = keep([
    item("/settings", "Settings", ICONS.settings, has("members.manage") || has("settings.manage") || has("audit.view")),
  ]);

  return { ops, finance, addons, admin };
}
