import type { Metadata } from "next";
import Link from "next/link";
import { NewLinkForm } from "@/components/ops/NewLinkForm";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Badge, ButtonLink, Card, Empty, PageHeader, Placeholder, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { day } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { reissueInvite } from "../invite/actions";

export const metadata: Metadata = { title: "Agent onboarding" };

const STEPS = [
  { title: "1. Details", text: "The agent confirms their full name and mobile number. Their progress is saved as they go." },
  { title: "2. Licence", text: "They enter their licence number and expiry and add a photo. A person at the brokerage confirms it against the state record." },
  { title: "3. W-9", text: "They give their legal name for tax reporting. Only the last four digits of the tax number are ever kept." },
  { title: "4. Rider signature", text: "They read their rider, tick to agree to sign electronically and type their full name. The time is recorded." },
];

type Row = {
  id: string; full_name: string; office: string; status: string; details_done_at: string | null; licence_status: string;
  w9_status: string; rider_status: string; invite_sent_at: string | null; invite_expires_at: string | null;
};

export default async function AgentOnboardingPage() {
  const access = await requireCap("agents.invite");
  const tz = access.workspace.timezone;
  const supabase = await createClient();
  const { data, error } = await supabase.from("agents")
    .select("id, full_name, office, status, details_done_at, licence_status, w9_status, rider_status, invite_sent_at, invite_expires_at")
    .eq("workspace_id", access.workspace.id).neq("onboarding_status", "ready").neq("status", "exited")
    .order("invite_sent_at", { ascending: false, nullsFirst: false }).limit(300);
  const rows = (data ?? []) as Row[];
  const now = Date.now();
  const linkState = (row: Row) => {
    if (!row.invite_expires_at) return <Badge tone="muted">No link yet</Badge>;
    return Date.parse(row.invite_expires_at) > now
      ? <span className={ui.soft}>Works until {day(row.invite_expires_at, tz)}</span>
      : <Badge tone="bad">Link expired</Badge>;
  };

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Onboarding"
        title="Agent onboarding"
        sub="What an invited agent is asked to do, and where each agent currently stands."
      >
        <ButtonLink href="/invite" primary>
          Invite agents
        </ButtonLink>
      </PageHeader>

      <Card title="What the agent does">
        <div className={ui.grid4}>
          {STEPS.map((step) => (
            <div key={step.title}>
              <h3 className={ui.strong}>{step.title}</h3>
              <p className={ui.help}>{step.text}</p>
            </div>
          ))}
        </div>
        <p className={ui.help} style={{ marginTop: 14 }}>
          Agents have no login. Each one opens a private link that works for 14 days, and each step stays locked until the
          one before it is valid. An agent is ready when their details are in, the licence is confirmed, the W-9 is received
          and the rider is signed.
        </p>
      </Card>

      <Card title="Currently onboarding" aside={<span className={ui.soft}>{rows.length} {rows.length === 1 ? "agent" : "agents"}</span>}>
        {error ? (
          <Empty>The list could not be loaded. Please refresh the page.</Empty>
        ) : rows.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Details</th>
                  <th scope="col">Licence</th>
                  <th scope="col">W-9</th>
                  <th scope="col">Rider</th>
                  <th scope="col">Link</th>
                  <th scope="col">New link</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/agents/${row.id}`} className={ui.rowLink}>{row.full_name}</Link>
                      <br />
                      <span className={ui.soft}>{row.office}</span> <StatusBadge kind="agent" value={row.status} />
                    </td>
                    <td>{row.details_done_at ? <Badge tone="ok">Done</Badge> : <Badge tone="muted">Not started</Badge>}</td>
                    <td><StatusBadge kind="licence" value={row.licence_status} /></td>
                    <td><StatusBadge kind="w9" value={row.w9_status} /></td>
                    <td><StatusBadge kind="rider" value={row.rider_status} /></td>
                    <td>{linkState(row)}</td>
                    <td style={{ minWidth: 220 }}>
                      <NewLinkForm action={reissueInvite} agentId={row.id} agentName={row.full_name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nobody is onboarding right now.</Empty>
        )}
        <div style={{ marginTop: 14 }}>
          <Placeholder service="Email (Resend)">
            A new link will be emailed to the agent automatically once the email service is connected. For now it is shown
            once here; copy it and send it by hand. Making a new link stops the old one from working.
          </Placeholder>
        </div>
      </Card>
    </div>
  );
}
