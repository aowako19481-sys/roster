import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Card, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { rulesOf } from "@/lib/automation";
import { documensoReady } from "@/lib/documenso";
import { readTiers, tiersToText } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";
import { saveAutomation } from "./actions";

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

        <Card title="When a tier move is approved">
          <div className={ui.stack}>
            <label className={ui.check}>
              <input type="checkbox" name="rider_on_tier" defaultChecked={rules.send_rider_on_tier} /> Send the new rider to be signed for the record as soon as it is approved
            </label>
            <p className={ui.help}>The approval itself is what changes pay, as it does today. This adds the agent’s own signature to their file without making anyone wait for it.</p>
            <label className={ui.field}>
              A team rider is signed by
              <select className={ui.select} name="team_mode" defaultValue={rules.team_rider_mode}>
                <option value="lead">The team lead only</option>
                <option value="members">Every team member</option>
              </select>
            </label>
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
    </div>
  );
}
