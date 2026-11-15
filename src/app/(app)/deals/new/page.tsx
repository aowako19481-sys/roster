import type { Metadata } from "next";
import { ButtonLink, Card, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { NewDealForm } from "./NewDealForm";

export const metadata: Metadata = { title: "New deal" };

export default async function NewDealPage() {
  const access = await requireCap("deals.edit");
  const ws = access.workspace.id;
  const supabase = await createClient();
  const [{ data: agents }, { data: offices }] = await Promise.all([
    supabase.from("agents").select("id, full_name, office, status").eq("workspace_id", ws).neq("status", "exited").order("full_name").limit(2000),
    supabase.from("offices").select("id, name").eq("workspace_id", ws).order("name").limit(200),
  ]);

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Finance"
        title="New deal"
        sub="Type the split from the notice of contract. The rider is checked when you save, and the payouts are worked out for you."
      >
        <ButtonLink href="/deals">Back to deals</ButtonLink>
      </PageHeader>
      <Card title="Deal sheet">
        <NewDealForm
          agents={((agents ?? []) as { id: string; full_name: string; office: string | null }[]).map((agent) => ({
            id: agent.id,
            label: agent.office ? `${agent.full_name} · ${agent.office}` : agent.full_name,
          }))}
          offices={(offices ?? []) as { id: string; name: string }[]}
        />
      </Card>
    </div>
  );
}
