import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Card, Empty, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { addPacketItem, togglePacketItem } from "./actions";

export const metadata: Metadata = { title: "Onboarding packet" };

const KIND_LABEL: Record<string, string> = {
  sign: "Sign",
  acknowledge: "Read and acknowledge",
  upload: "Upload a file",
  outside: "Step outside the app",
};

export default async function PacketPage() {
  const access = await requireCap("agents.view");
  const ws = access.workspace.id;
  const canManage = access.caps.has("riders.manage");
  const supabase = await createClient();

  const [{ data: items }, { data: agents }, { data: doneRows }, { data: teamRows }] = await Promise.all([
    supabase.from("packet_items").select("id, title, kind, body, file_path, required, applies_to, active, position").eq("workspace_id", ws).order("position").limit(200),
    supabase.from("agents").select("id, full_name, office, status").eq("workspace_id", ws).in("status", ["invited", "onboarding", "flagged"]).order("full_name").limit(500),
    supabase.from("agent_packet").select("agent_id, item_id").eq("workspace_id", ws).limit(20000),
    supabase.from("team_members").select("agent_id").eq("workspace_id", ws).limit(5000),
  ]);

  const list = items ?? [];
  const onTeam = new Set((teamRows ?? []).map((row) => row.agent_id as string));
  const doneBy = new Map<string, Set<string>>();
  for (const row of doneRows ?? []) {
    const set = doneBy.get(row.agent_id as string) ?? new Set<string>();
    set.add(row.item_id as string);
    doneBy.set(row.agent_id as string, set);
  }
  const requiredFor = (agentId: string) =>
    list.filter((item) => item.active && item.required && (item.applies_to === "everyone" || onTeam.has(agentId)));

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Onboarding"
        title="Onboarding packet"
        sub="The paperwork every new agent completes in their private portal. Full taxpayer numbers and bank details are never collected here: those stay with the W-9 service and your payroll system."
      />

      <Card title="What is in the packet" aside={<span className={ui.soft}>{list.filter((item) => item.active).length} active</span>}>
        {list.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">The agent must</th>
                  <th scope="col">For</th>
                  <th scope="col">Required</th>
                  <th scope="col">Document</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className={ui.strong}>{item.title}</span>
                      {item.body && <div className={ui.soft}>{item.body}</div>}
                    </td>
                    <td>{KIND_LABEL[item.kind] ?? item.kind}</td>
                    <td>{item.applies_to === "team" ? "Team members" : "Everyone"}</td>
                    <td>{item.required ? "Required" : "Optional"}</td>
                    <td>{item.file_path ? "PDF attached" : "Text only"}</td>
                    <td>
                      <div className={ui.inline}>
                        <Badge tone={item.active ? "ok" : "muted"}>{item.active ? "In use" : "Switched off"}</Badge>
                        {canManage && (
                          <ActionForm action={togglePacketItem} className={ui.inline}>
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="active" value={item.active ? "false" : "true"} />
                            <Submit small variant="plain">
                              {item.active ? "Switch off" : "Switch on"}
                            </Submit>
                          </ActionForm>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing in the packet yet.</Empty>
        )}
      </Card>

      {canManage && (
        <Card title="Add an item">
          <ActionForm action={addPacketItem} resetOnSuccess>
            <div className={ui.formRow}>
              <label className={ui.field}>
                Title
                <input className={ui.input} name="title" required maxLength={120} placeholder="Independent contractor agreement" />
              </label>
              <label className={ui.field}>
                The agent must
                <select className={ui.select} name="kind" defaultValue="sign">
                  <option value="sign">Sign it</option>
                  <option value="acknowledge">Read and acknowledge it</option>
                  <option value="upload">Upload a file</option>
                  <option value="outside">Do a step outside the app</option>
                </select>
              </label>
            </div>
            <label className={ui.field}>
              Short description or instructions (shown to the agent)
              <textarea className={ui.textarea} name="body" maxLength={4000} />
            </label>
            <label className={ui.field}>
              Your document, as a PDF (optional, up to 10 MB)
              <input name="file" type="file" accept="application/pdf" />
            </label>
            <label className={ui.check}>
              <input type="checkbox" name="required" defaultChecked />
              <span>Required before the agent counts as ready</span>
            </label>
            <label className={ui.check}>
              <input type="checkbox" name="team_only" />
              <span>Only for agents on a team</span>
            </label>
            <p className={ui.help}>
              Do not add items that ask for a full Social Security number, bank details, a date of birth or an ID scan.
            </p>
            <Submit>Add to packet</Submit>
          </ActionForm>
        </Card>
      )}

      <Card title="Who is still completing it" aside={<span className={ui.soft}>{agents?.length ?? 0} agents onboarding</span>}>
        {agents?.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Office</th>
                  <th scope="col">Paperwork</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const required = requiredFor(agent.id);
                  const doneCount = required.filter((item) => doneBy.get(agent.id)?.has(item.id)).length;
                  const complete = doneCount === required.length;
                  return (
                    <tr key={agent.id}>
                      <td>
                        <Link href={`/packet/${agent.id}`} className={ui.rowLink}>
                          {agent.full_name}
                        </Link>
                      </td>
                      <td>{agent.office}</td>
                      <td>
                        {doneCount} of {required.length} required
                      </td>
                      <td>
                        <Badge tone={complete ? "ok" : "plain"}>{complete ? "Complete" : "In progress"}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No one is onboarding right now.</Empty>
        )}
      </Card>
    </div>
  );
}
