import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, ButtonLink, Card, Empty, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { DEFAULT_CHECKLIST } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { addChecklistItem, changeChecklistItem, saveDealSystem } from "./actions";

export const metadata: Metadata = { title: "Deal checklist" };

export default async function ChecklistSettingsPage() {
  const access = await requireCap("deals.view");
  const ws = access.workspace.id;
  const canManage = access.caps.has("payroll.manage");
  const supabase = await createClient();
  const [{ data: items }, { data: settings }] = await Promise.all([
    supabase.from("checklist_items").select("id, label, active, position").eq("workspace_id", ws).order("position").limit(60),
    supabase.from("workspaces").select("deal_system").eq("id", ws).maybeSingle(),
  ]);
  const own = items ?? [];
  const system = (settings?.deal_system ?? "").trim();

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Finance" title="Deal checklist" sub="The boxes every new deal starts with. Make them match the way your brokerage works and the apps it uses.">
        <ButtonLink href="/settings">Settings</ButtonLink>
      </PageHeader>

      <div className={ui.grid2}>
        <Card title="Your checklist" aside={<span className={ui.soft}>{own.length ? `${own.filter((item) => item.active).length} in use` : "Standard list"}</span>}>
          {own.length ? (
            <ul className={ui.list}>
              {own.map((item) => (
                <li key={item.id}>
                  <div className={ui.inline} style={{ justifyContent: "space-between" }}>
                    <span className={item.active ? ui.strong : ui.soft}>{item.label}</span>
                    <span className={ui.inline}>
                      <Badge tone={item.active ? "ok" : "muted"}>{item.active ? "On new deals" : "Switched off"}</Badge>
                      {canManage && (
                        <>
                          <ActionForm action={changeChecklistItem} className={ui.inline}>
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="what" value={item.active ? "off" : "on"} />
                            <Submit small variant="plain">{item.active ? "Switch off" : "Switch on"}<span className="sr-only"> {item.label}</span></Submit>
                          </ActionForm>
                          <ActionForm action={changeChecklistItem} className={ui.inline}>
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="what" value="remove" />
                            <Submit small variant="link">Remove<span className="sr-only"> {item.label}</span></Submit>
                          </ActionForm>
                        </>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <ul className={ui.list}>
                {DEFAULT_CHECKLIST.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
              <Empty>This is the standard list. Add a box of your own and it becomes yours to change.</Empty>
              {canManage && (
                <ActionForm action={changeChecklistItem} className={ui.inline}>
                  <input type="hidden" name="what" value="start" />
                  <Submit small variant="plain">Edit the standard list</Submit>
                </ActionForm>
              )}
            </>
          )}
          <p className={ui.help}>Changes apply to deals created from now on. Deals already created keep the boxes they have.</p>
        </Card>

        <div className={ui.stack}>
          {canManage ? (
            <>
              <Card title="Add a box">
                <ActionForm action={addChecklistItem} resetOnSuccess>
                  <label className={ui.field}>
                    What the box says
                    <input className={ui.input} name="label" required maxLength={120} placeholder="Uploaded to SkySlope" />
                  </label>
                  <p className={ui.help}>For example a step in an app your brokerage uses, or a document your state requires.</p>
                  <div><Submit>Add to the checklist</Submit></div>
                </ActionForm>
              </Card>
              <Card title="Where your deal files live">
                <ActionForm action={saveDealSystem}>
                  <label className={ui.field}>
                    Name of the system (leave empty if you do not use one)
                    <input className={ui.input} name="system" defaultValue={system} maxLength={40} placeholder="Dotloop, SkySlope, Brokermint…" />
                  </label>
                  <p className={ui.help}>The name appears on the deal checklist and in the “we are missing documents” message to agents.</p>
                  <div><Submit>Save</Submit></div>
                </ActionForm>
              </Card>
            </>
          ) : (
            <Card title="Who can change this">
              <p className={ui.help}>Only a manager (the owner or a finance manager) can change the checklist.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
