import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, ButtonLink, Card, Empty, PageHeader, ui } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/access";
import { BRAND } from "@/lib/brand";
import { dayTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { handleLead } from "./actions";

export const metadata: Metadata = { title: "Website inbox" };

export default async function InboxPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, created_at, name, company, email, agents, plan, message, handled_at, handled_by")
    .order("created_at", { ascending: false })
    .limit(200);
  const open = (leads ?? []).filter((lead) => !lead.handled_at).length;

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow={`${BRAND} staff`} title="Website inbox" sub="Messages sent from the Get started button on the public website. Reply by email, then mark each one done.">
        <ButtonLink href="/kinu">Console</ButtonLink>
      </PageHeader>
      <Card title="Messages" aside={<Badge tone={open ? "warn" : "ok"}>{open ? `${open} to answer` : "All answered"}</Badge>}>
        {error ? (
          <Empty>The inbox is not set up yet. Run the latest setup file in Supabase to switch it on.</Empty>
        ) : leads?.length ? (
          <ul className={ui.list}>
            {leads.map((lead) => (
              <li key={lead.id}>
                <div className={ui.inline} style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <p className={ui.strong}>
                      {lead.name} · {lead.company}
                    </p>
                    <p>
                      <a href={`mailto:${lead.email}`} className={ui.rowLink}>
                        {lead.email}
                      </a>
                      <span className={ui.soft}>
                        {" "}
                        · {dayTime(lead.created_at)}
                        {lead.agents ? ` · ${lead.agents} agents` : ""}
                      </span>
                    </p>
                    {lead.plan && <p className={ui.soft}>Interested in: {lead.plan}</p>}
                    {lead.message && <p style={{ marginTop: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{lead.message}</p>}
                    {lead.handled_at && (
                      <p className={ui.soft}>
                        Done {dayTime(lead.handled_at)}
                        {lead.handled_by ? ` by ${lead.handled_by}` : ""}
                      </p>
                    )}
                  </div>
                  <ActionForm action={handleLead} className={ui.inline}>
                    <input type="hidden" name="id" value={lead.id} />
                    <input type="hidden" name="handled" value={lead.handled_at ? "false" : "true"} />
                    <Submit small variant="plain">
                      {lead.handled_at ? "Reopen" : "Mark done"}
                    </Submit>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No messages yet. They appear here the moment someone uses Get started.</Empty>
        )}
      </Card>
    </div>
  );
}
