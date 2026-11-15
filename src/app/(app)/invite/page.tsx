import type { Metadata } from "next";
import { InviteForm } from "@/components/ops/InviteForm";
import { ButtonLink, Card, Empty, PageHeader, Placeholder, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { dayTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { inviteAgents } from "./actions";

export const metadata: Metadata = { title: "Invite agents" };

export default async function InvitePage() {
  const access = await requireCap("agents.invite");
  const ws = access.workspace.id;
  const tz = access.workspace.timezone;
  const supabase = await createClient();
  const [officeRes, batchRes] = await Promise.all([
    supabase.from("offices").select("id, name").eq("workspace_id", ws).order("name"),
    supabase.from("onboarding_batches").select("id, sent_at, sent_count, ready_count").eq("workspace_id", ws).order("sent_at", { ascending: false }).limit(10),
  ]);
  const offices = ((officeRes.data ?? []) as { id: string; name: string }[]).map((office) => office.name);
  const batches = (batchRes.data ?? []) as { id: string; sent_at: string; sent_count: number; ready_count: number }[];
  const first = offices[0] ?? "Main office";
  const second = offices[1] ?? first;
  const example = `Priya Nair, priya.nair@example.com, 70, ${first}\nLena Park, lena.park@example.com, 75%, ${second}`;

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Onboarding"
        title="Invite agents"
        sub="Paste names, emails, splits and offices from the offer sheet. Agents fill in everything else themselves."
      >
        <ButtonLink href="/welcome-email">Preview the welcome email</ButtonLink>
        <ButtonLink href="/agent-onboarding">Who is onboarding</ButtonLink>
      </PageHeader>

      <Card title="Who is joining?">
        <div className={ui.stack}>
          <div>
            <p className={ui.help}>Example:</p>
            <pre className={ui.mono} style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{example}</pre>
          </div>
          <InviteForm action={inviteAgents} example={example} offices={offices} />
          <p className={ui.help}>
            Each agent gets a private link that works for 14 days. Their split becomes a rider waiting for their signature;
            nothing is paid on it until they sign.
          </p>
          <Placeholder service="Email (Resend)">
            The welcome email with this link will be sent automatically, with reminders at 24 and 72 hours, once the email
            service is connected. For now, copy each link from the results and send it by hand.
          </Placeholder>
        </div>
      </Card>

      <Card title="Recent batches" aside={<span className={ui.soft}>Invites sent within the same hour count as one batch</span>}>
        {batches.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Sent</th>
                  <th scope="col" className={ui.num}>Invited</th>
                  <th scope="col" className={ui.num}>Ready</th>
                  <th scope="col" className={ui.num}>Still onboarding</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td><time dateTime={batch.sent_at}>{dayTime(batch.sent_at, tz)}</time></td>
                    <td className={ui.num}>{batch.sent_count}</td>
                    <td className={ui.num}>{batch.ready_count}</td>
                    <td className={ui.num}>{Math.max(batch.sent_count - batch.ready_count, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No batches yet. Your first invites will show here.</Empty>
        )}
      </Card>
    </div>
  );
}
