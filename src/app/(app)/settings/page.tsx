import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Card, Empty, PageHeader, Tabs, ui } from "@/components/ui";
import { requireWorkspace } from "@/lib/access";
import { ADDONS, WEEKDAYS, settingsTabs, timeValue, timezoneOptions } from "@/lib/admin-pages";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { addOffice, removeOffice, renameOffice, saveSettings } from "./actions";
import styles from "./settings.module.css";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const access = await requireWorkspace();
  const tabs = settingsTabs(access.caps);
  if (!tabs.length) redirect("/locked?need=settings.manage");
  const ws = access.workspace;
  const canManage = access.caps.has("settings.manage");
  const editable = canManage && !access.viewAs;

  const supabase = await createClient();
  const [{ data: row }, { data: offices }, { data: agentOffices }] = await Promise.all([
    supabase.from("workspaces")
      .select("id, timezone, payroll_weekdays, cutoff_time, close_time, max_teams_per_agent, reply_alias")
      .eq("id", ws.id).maybeSingle(),
    supabase.from("offices").select("id, name").eq("workspace_id", ws.id).order("name").limit(200),
    supabase.from("agents").select("office_id").eq("workspace_id", ws.id).limit(5000),
  ]);

  const weekdays: number[] = row?.payroll_weekdays ?? [];
  const perOffice = new Map<string, number>();
  for (const agent of agentOffices ?? []) {
    if (agent.office_id) perOffice.set(agent.office_id, (perOffice.get(agent.office_id) ?? 0) + 1);
  }

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Settings" title="General" sub={`How ${ws.name} runs: payroll days, cutoff, offices and what is switched on.`} />
      <Tabs items={tabs} current="/settings" />

      <Card title="Your plan">
        <dl className={ui.kv}>
          <dt>Products</dt>
          <dd className={ui.inline}>
            <Badge tone={ws.hasOps ? "ok" : "muted"}>Ops · {ws.hasOps ? "On" : "Not in plan"}</Badge>
            <Badge tone={ws.hasFinance ? "ok" : "muted"}>Finance · {ws.hasFinance ? "On" : "Not in plan"}</Badge>
          </dd>
          <dt>Add-ons</dt>
          <dd className={ui.inline}>
            {ADDONS.map((addon) => {
              const on = ws.addons.includes(addon.key);
              return <Badge key={addon.key} tone={on ? "ok" : "muted"}>{addon.label} · {on ? "On" : "Not in plan"}</Badge>;
            })}
          </dd>
        </dl>
        <p className={ui.help}>
          Products and add-ons are switched on by {BRAND}, not here. Ask your {BRAND} contact if you want to add or remove one.
        </p>
      </Card>

      {canManage ? (
        <>
          <Card title="Payroll and time">
            {row ? (
              <ActionForm action={saveSettings}>
                <fieldset className={styles.group}>
                  <legend>Payroll days</legend>
                  <div className={ui.inline}>
                    {WEEKDAYS.map((weekday) => (
                      <label key={weekday.value} className={ui.check}>
                        <input type="checkbox" name={`day_${weekday.value}`} defaultChecked={weekdays.includes(weekday.value)} disabled={!editable} />{" "}
                        {weekday.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className={ui.formRow}>
                  <label className={ui.field}>
                    Time zone
                    <select className={ui.select} name="timezone" defaultValue={row.timezone} disabled={!editable}>
                      {timezoneOptions(row.timezone).map((zone) => (
                        <option key={zone.value} value={zone.value}>{zone.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className={ui.field}>
                    Cutoff time on payroll day
                    <input className={ui.input} type="time" name="cutoff" defaultValue={timeValue(row.cutoff_time, "08:30")} required disabled={!editable} />
                  </label>
                  <label className={ui.field}>
                    Close time
                    <input className={ui.input} type="time" name="close" defaultValue={timeValue(row.close_time, "18:00")} required disabled={!editable} />
                  </label>
                </div>
                <div className={ui.formRow}>
                  <label className={ui.field}>
                    Reply-to alias
                    <input className={ui.input} name="alias" defaultValue={row.reply_alias ?? ""} maxLength={254} autoComplete="off" disabled={!editable} />
                  </label>
                  <label className={ui.field}>
                    Maximum teams per agent
                    <input className={ui.input} type="number" name="max_teams" min={1} max={10} step={1} defaultValue={row.max_teams_per_agent ?? 1} required disabled={!editable} />
                  </label>
                </div>
                <p className={ui.help}>
                  Deals cleared before the cutoff go into that day’s payroll; anything later waits for the next payroll day.
                  The reply-to alias is where replies to emails sent for the brokerage will go once email is connected. Leaving
                  it empty keeps the current one.
                </p>
                {editable && (
                  <div>
                    <Submit>Save settings</Submit>
                  </div>
                )}
              </ActionForm>
            ) : (
              <Empty>The settings could not be loaded. Try again in a moment.</Empty>
            )}
          </Card>

          <Card title="Offices" aside={<span className={ui.soft}>{offices?.length ?? 0} in total</span>}>
            {offices?.length ? (
              <ul className={ui.list}>
                {offices.map((office) => {
                  const count = perOffice.get(office.id) ?? 0;
                  return (
                    <li key={office.id}>
                      <div className={ui.inline}>
                        <ActionForm action={renameOffice} className={ui.inline}>
                          <input type="hidden" name="id" value={office.id} />
                          <label className={ui.field}>
                            <span className="sr-only">Name of {office.name}</span>
                            <input className={ui.input} name="name" defaultValue={office.name} required minLength={2} maxLength={80} autoComplete="off" disabled={!editable} />
                          </label>
                          {editable && <Submit small variant="plain">Rename</Submit>}
                        </ActionForm>
                        {editable && (offices.length > 1) && (
                          <ActionForm action={removeOffice} className={ui.inline}>
                            <input type="hidden" name="id" value={office.id} />
                            <Submit small variant="danger">Remove<span className="sr-only"> {office.name}</span></Submit>
                          </ActionForm>
                        )}
                        <span className={ui.soft}>{count === 1 ? "1 agent" : `${count} agents`}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>No offices yet. Add the first one below.</Empty>
            )}
            <p className={ui.help}>
              Removing an office does not remove its agents, deals or people; they are simply left without an office until you
              choose a new one for them.
            </p>
            {editable && (
              <ActionForm action={addOffice} className={ui.inline} resetOnSuccess>
                <label className={ui.field}>
                  New office
                  <input className={ui.input} name="name" required minLength={2} maxLength={80} autoComplete="off" />
                </label>
                <Submit small>Add office</Submit>
              </ActionForm>
            )}
          </Card>
        </>
      ) : (
        <Card title="Payroll, time and offices">
          <Empty>Your role can open other settings pages, but only people who may change brokerage settings can see this part.</Empty>
        </Card>
      )}
    </div>
  );
}
