import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { FounderBackdrop } from "@/components/FounderBackdrop";
import { AutoSelect } from "@/components/ActionForm";
import { Dock } from "@/components/Dock";
import { LOOK_COOKIE, VIEW_COOKIE, getAccess } from "@/lib/access";
import { BRAND } from "@/lib/brand";
import { buildNav } from "@/lib/nav";
import { BUILT_IN_ROLES, roleLabel } from "@/lib/roles";
import { leaveWorkspace, setLook, setView, setViewAs, signOut, switchWorkspace } from "./actions";
import styles from "./shell.module.css";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The proxy already redirects signed-out visitors. This second, server-side
  // check means a page can never render without a verified user.
  const access = await getAccess();
  if (!access) redirect("/sign-in");

  const ws = access.workspace;
  // The founder's own look, on the console pages only.
  const path = (await headers()).get("x-kinu-path") ?? "";
  const founderView = access.isFounder && !ws && (path === "/kinu" || path.startsWith("/kinu/"));
  const jar = await cookies();
  const look = jar.get(LOOK_COOKIE)?.value === "violet" ? "violet" : "silver";
  // A brokerage member's Advanced view: the same pages in a high-tech skin, over the moving silver backdrop.
  const advanced = Boolean(ws) && jar.get(VIEW_COOKIE)?.value === "advanced";
  const mayPreview = Boolean(ws) && (access.isPlatformAdmin || access.role === "owner_admin");
  const nav = buildNav(access);

  return (
    <div className={styles.page} data-print-root="" data-founder={founderView ? look : undefined} data-view={advanced ? "advanced" : undefined}>
      {advanced && <FounderBackdrop look="silver" />}
      {founderView && <FounderBackdrop look={look} />}
      <div className={styles.wrap}>
        <header className={styles.bar} data-app-chrome="">
          <Link href="/" className={`brandType ${styles.wordmark}`}>
            {BRAND}
          </Link>

          {access.isPlatformAdmin && !ws ? (
            <span className={styles.workspace}>Console · no brokerage open</span>
          ) : access.workspaces.length > 1 ? (
            <form action={switchWorkspace} className={styles.pick}>
              <AutoSelect
                name="ws"
                value={ws?.id ?? ""}
                label="Brokerage"
                className={styles.pickSelect}
                options={access.workspaces.map((w) => ({ value: w.id, label: w.name }))}
              />
            </form>
          ) : (
            ws && <span className={styles.workspace}>{ws.name}</span>
          )}

          {mayPreview && (
            <form action={setViewAs} className={styles.pick}>
              <AutoSelect
                name="role"
                value={access.viewAs ?? ""}
                label="View as role"
                className={styles.pickSelect}
                options={[
                  { value: "", label: access.isPlatformAdmin ? "View as: Kinu staff (everything)" : "View as: myself" },
                  ...BUILT_IN_ROLES.map((role) => ({ value: role, label: `View as: ${roleLabel(role)}` })),
                ]}
              />
            </form>
          )}

          <div className={styles.barEnd}>
            {ws && access.caps.has("agents.view") && (
              <form action={setView} className={styles.look} role="group" aria-label="Home screen" data-tour="advanced">
                <button type="submit" name="view" value="standard" aria-pressed={!advanced}>
                  Standard
                </button>
                <button type="submit" name="view" value="advanced" aria-pressed={advanced}>
                  Advanced
                </button>
              </form>
            )}
            {founderView && (
              <form action={setLook} className={styles.look} role="group" aria-label="Console colours">
                <input type="hidden" name="back" value={path} />
                <button type="submit" name="look" value="silver" aria-pressed={look === "silver"}>
                  Silver
                </button>
                <button type="submit" name="look" value="violet" aria-pressed={look === "violet"}>
                  Violet
                </button>
              </form>
            )}
            {access.isPlatformAdmin && (
              ws ? (
                <form action={leaveWorkspace}>
                  <button type="submit" className={styles.console}>
                    Leave {ws.name} · back to console
                  </button>
                </form>
              ) : (
                <Link href="/kinu" className={styles.console}>
                  {BRAND} console
                </Link>
              )
            )}
            <form action={signOut} className={styles.account}>
              <span className={styles.avatar} aria-hidden="true">
                {access.initials}
              </span>
              <span className={styles.accountText}>
                <span className={styles.accountName}>{access.displayName}</span>
                <button type="submit" className={styles.signOut}>
                  Sign out
                </button>
              </span>
            </form>
          </div>
        </header>

        {access.viewAs && (
          <p className={styles.preview} role="status" data-app-chrome="">
            Previewing as <strong>{roleLabel(access.viewAs)}</strong>. Pages and buttons are limited to what this role is
            allowed. Nothing can be changed while previewing.
          </p>
        )}

        {ws ? (
          <div className={styles.body}>
            <div className={styles.rail} data-app-chrome="">
              <Dock groups={nav} />
            </div>
            <main id="content" className={styles.main}>
              {children}
            </main>
          </div>
        ) : (
          <main id="content" className={styles.main}>
            {children}
          </main>
        )}
      </div>
    </div>
  );
}
