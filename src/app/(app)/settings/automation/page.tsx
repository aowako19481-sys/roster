import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Card, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { rulesOf } from "@/lib/automation";
import { documensoReady } from "@/lib/documenso";
import { readTiers, tiersToText } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";
import { saveAutomation, saveBackground, saveLicenceAuto, saveLicenceLookup } from "./actions";

export const metadata: Metadata = { title: "Automation" };

const STARTING = [{ from: 0, to: 20000, pct: 70 }, { from: 20000, to: 40000, pct: 80 }, { from: 40000, to: null, pct: 85 }];

export default async function AutomationPage() {
  const access = await requireCap("settings.manage");
  const supabase = await createClient();
  const rules = await rulesOf(supabase, access.workspace.id);
  const tiers = readTiers(rules.default_tiers);
  const { data: packs } = await supabase.from("sign_templates").select("name, pack").eq("workspace_id", access.workspace.id).eq("active", true).neq("pack", "none").order("name");
  const invitePack = (packs ?? []).filter((row) => row.pack === "invite").map((row) => row.name as string);
  const exitPack = (packs ?? []).filter((row) => row.pack === "exit").map((row) => row.name as string);
  const signingOn = documensoReady();
  const { data: quiet } = await supabase.from("automation").select("chase_signatures, nudge_onboarding, licence_reminders, weekly_summary, auto_confirm_licence").eq("workspace_id", access.workspace.id).maybeSingle();
  const background = { chase: quiet?.chase_signatures ?? true, nudge: quiet?.nudge_onboarding ?? true, licence: quiet?.licence_reminders ?? true, weekly: quiet?.weekly_summary ?? true };
  const { data: lookups } = await supabase.from("licence_lookups").select("state, url").eq("workspace_id", access.workspace.id).order("state");

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Settings" title="Automation" sub="Set this up once. After that, Kinu does these steps by itself and only comes back to you for a decision.">
        <Link className={ui.btn} href="/settings">Back to settings</Link>
      </PageHeader>
      {!signingOn ? <p className={ui.error} role="alert">Electronic signing is not switched on yet, so nothing is sent for signature automatically.</p> : null}

      <Card title="What Kinu never does by itself" aside={<Badge tone="muted">Always a person</Badge>}>
        <p className={ui.help}>Releasing payroll, overriding a split and approving a tier move always need a person with that power. Automation prepares the work; it does not make those decisions.</p>
      </Card>

      <ActionForm action={saveAutomation} className={ui.stack}>
        <Card title="When an agent is invited">
          <div className={ui.stack}>
            <label className={ui.check}>
              <input type="checkbox" name="pack_on_invite" defaultChecked={rules.send_pack_on_invite} /> Send your new-agent documents for signature straight away
            </label>
            <p className={ui.help}>
              {invitePack.length ? `In the pack now: ${invitePack.join(", ")}.` : "No documents are in the new-agent pack yet."}{" "}
              <Link href="/sign">Choose them on the Sign page</Link>.
            </p>
            <label className={ui.check}>
              <input type="checkbox" name="rider_on_invite" defaultChecked={rules.send_rider_on_invite} /> Send their first rider for signature straight away
            </label>
            <label className={ui.field}>
              The tiers every new agent starts on (one per line: from, to, split to the agent)
              <textarea className={ui.textarea} name="tiers" rows={5} required defaultValue={tiersToText(tiers.length ? tiers : STARTING)} />
            </label>
            <p className={ui.help}>Leave “to” empty on the last line for “and above”. The starting split is still typed for each agent when you invite them.</p>
          </div>
        </Card>

        <Card title="When a split changes">
          <div className={ui.stack}>
            <label className={ui.check}>
              <input type="checkbox" name="rider_on_tier" defaultChecked={rules.send_rider_on_tier} /> When a split changes to something that is not in the signed rider, send the new rider for signature
            </label>
            <p className={ui.help}>If the rider an agent signed already lists their tiers, moving up a tier was agreed in advance and nothing is sent. A new rider only goes out when the new split is outside what they signed.</p>
            <label className={ui.field}>
              A team rider is signed by
              <select className={ui.select} name="team_mode" defaultValue={rules.team_rider_mode}>
                <option value="lead">The team lead only</option>
                <option value="members">Every team member</option>
              </select>
            </label>
          </div>
        </Card>

        <Card title="When a deal is entered">
          <div className={ui.stack}>
            <label className={ui.check}>
              <input type="checkbox" name="prefill_splits" defaultChecked={rules.prefill_splits} /> Fill in each agent’s split from their signed rider
            </label>
            <p className={ui.help}>The person entering the deal can still change it. A split that differs from the rider is flagged exactly as it is today, and the deal cannot be paid until it is fixed, approved or overridden.</p>
          </div>
        </Card>

        <Card title="Payroll">
          <div className={ui.stack}>
            <label className={ui.check}>
              <input type="checkbox" name="auto_open_payroll" defaultChecked={rules.auto_open_payroll} /> Open the next payroll by itself on your pay days
            </label>
            <p className={ui.help}>Your pay days and cutoff time are set under <Link href="/settings">Settings</Link>.</p>
            <label className={ui.check}>
              <input type="checkbox" name="auto_cutoff" defaultChecked={rules.auto_cutoff} /> Run the cutoff by itself once the cutoff time has passed
            </label>
            <p className={ui.help}>Cleared deals go into the run and anything not cleared goes to the Held folder, exactly as when you press the button. Releasing the payroll always stays with a person.</p>
          </div>
        </Card>

        <Card title="When an agent leaves">
          <p className={ui.help}>
            {exitPack.length ? `Sent for signature when an agent is marked as leaving: ${exitPack.join(", ")}.` : "No documents are in the exit pack yet."}{" "}
            <Link href="/sign">Choose them on the Sign page</Link>.
          </p>
        </Card>

        <Submit>Save automation</Submit>
      </ActionForm>

      <Card title="While nobody is signed in" aside={<Badge tone="muted">Once a day</Badge>}>
        <ActionForm action={saveBackground} className={ui.stack}>
          <label className={ui.check}><input type="checkbox" name="chase" defaultChecked={background.chase} /> Remind people who have not signed, up to three times</label>
          <label className={ui.check}><input type="checkbox" name="nudge" defaultChecked={background.nudge} /> Email invited agents a fresh link if they have not finished, on days 2, 5 and 9</label>
          <label className={ui.check}><input type="checkbox" name="licence" defaultChecked={background.licence} /> Tell agents 90, 60 and 30 days before their licence expires</label>
          <label className={ui.check}><input type="checkbox" name="weekly" defaultChecked={background.weekly} /> Email your admins a summary every Monday, with who to check in with if you have Retention Insights</label>
          <p className={ui.help}>Signed documents are also collected and filed without anyone having Kinu open. Emails go to people you invited and to your own admins, and to nobody else.</p>
          <Submit small>Save</Submit>
        </ActionForm>
      </Card>

      <Card title="Licence checks" aside={<Badge tone="muted">A person confirms</Badge>}>
        <div className={ui.stack}>
          <p className={ui.help}>
            <strong>New York and Texas</strong> publish their licence records, so Kinu checks those itself: that the licence is on the state’s list, in good standing, not expired, and in the same name. It looks again every week, so a lapse or suspension is noticed. Anything that does not match goes to a person; it is never an automatic rejection. State data is updated daily and can lag by a few days, so if a record is disputed or recently changed, the state regulator’s own look-up decides.
          </p>
          <ActionForm action={saveLicenceAuto} className={ui.inline}>
            <label className={ui.check}>
              <input type="checkbox" name="auto_confirm" defaultChecked={quiet?.auto_confirm_licence ?? true} /> When the state record matches in full, confirm the licence without waiting for a person
            </label>
            <Submit small variant="plain">Save</Submit>
          </ActionForm>
          <p className={ui.help}>
            <strong>Every other state:</strong> Kinu runs its own checks and a person at your brokerage confirms the licence against the state’s public record. Save each state’s official look-up page once, and staff reach it in one click from the agent’s page. Kinu records who confirmed each licence, and when.
          </p>
          {(lookups ?? []).length ? (
            <ul className={ui.list}>
              {(lookups ?? []).map((row) => <li key={row.state as string}><strong>{row.state as string}</strong>: <span className={ui.mono}>{row.url as string}</span></li>)}
            </ul>
          ) : <p className={ui.soft}>No state look-ups saved yet.</p>}
          <ActionForm action={saveLicenceLookup} className={ui.inline} resetOnSuccess>
            <label className={ui.field} style={{ flex: "0 0 90px" }}>
              State
              <input className={ui.input} name="state" required maxLength={2} placeholder="NY" autoCapitalize="characters" />
            </label>
            <label className={ui.field} style={{ flex: "1 1 320px" }}>
              Address of the state’s official look-up page (leave empty to remove)
              <input className={ui.input} name="url" type="url" maxLength={400} placeholder="https://" />
            </label>
            <Submit small>Save look-up</Submit>
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
