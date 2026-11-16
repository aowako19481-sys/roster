import type { Metadata } from "next";
import { ButtonLink, Card, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { rulesOf } from "@/lib/automation";
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
  const [rules, { data: splitRows }] = await Promise.all([rulesOf(supabase, ws), supabase.rpc("rider_splits", { ws })]);
  const riders: Record<string, { individual: number | null; team: number | null }> = {};
  for (const row of (splitRows ?? []) as { agent_id: string; individual_pct: number | string | null; team_pct: number | string | null }[]) {
    riders[row.agent_id] = { individual: row.individual_pct === null ? null : Number(row.individual_pct), team: row.team_pct === null ? null : Number(row.team_pct) };
  }

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Finance"
        title="New deal"
        sub="Choose the agents and type the commission. Kinu fills in each split from the signed rider and shows who gets what before you save."
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
          riders={riders}
          prefill={rules.prefill_splits}
        />
      </Card>
    </div>
  );
}
