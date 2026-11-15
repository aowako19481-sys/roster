import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Placeholder, Stat, ui, type Tone } from "@/components/ui";
import { requireAddon } from "@/lib/access";
import {
  CHECK_IN_OUTCOMES, RISK_BANDS, RISK_RULES, riskScore, suggestedOpener, type DealActivity, type RetentionAgent,
} from "@/lib/admin-pages";
import { todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import styles from "../settings/settings.module.css";

export const metadata: Metadata = { title: "Retention Insights" };

const BAND_TONE: Record<string, Tone> = { High: "bad", Watch: "warn", Healthy: "ok" };
const OPEN_STATUSES = ["open", "held", "cleared", "processed"];
const CHUNK = 1000;
const MAX_ROWS = 20000;

export default async function RetentionPage() {
  const access = await requireAddon("retention", "reports.view");
  const ws = access.workspace;
  const seeCommission = access.caps.has("splits.view");
  const seeDeals = ws.hasFinance && access.caps.has("deals.view");
  const today = todayIso(ws.timezone);
  const supabase = await createClient();

  // Commission movement is only read for people who may see splits.
  const columns = "id, full_name, office, status, licence_status, licence_expires_on, onboarding_status, invite_sent_at, joined_on, created_at"
    + (seeCommission ? ", gci_change_pct" : "");
  const { data: agentRows, error } = await supabase.from("agents").select(columns)
    .eq("workspace_id", ws.id).neq("status", "exited").order("full_name").limit(5000);
  const agents = ((agentRows ?? []) as unknown as (Omit<RetentionAgent, "gci_change_pct"> & { gci_change_pct?: number | null })[])
    .map((agent) => ({ ...agent, gci_change_pct: agent.gci_change_pct ?? null }));

  // Deal activity per agent: how many deals are still open, and when one last moved.
  const activity = new Map<string, DealActivity>();
  if (seeDeals && agents.length) {
    const since = new Date(Date.parse(`${today}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
    const deals = new Map<string, { status: string; updated_at: string }>();
    for (let from = 0; from < MAX_ROWS; from += CHUNK) {
      const { data } = await supabase.from("deals").select("id, status, updated_at")
        .eq("workspace_id", ws.id).or(`status.in.(${OPEN_STATUSES.join(",")}),updated_at.gte.${since}`)
        .order("id").range(from, from + CHUNK - 1);
      for (const deal of data ?? []) deals.set(deal.id, { status: deal.status, updated_at: deal.updated_at });
      if (!data || data.length < CHUNK) break;
    }
    if (deals.size) {
      for (let from = 0; from < MAX_ROWS; from += CHUNK) {
        const { data } = await supabase.from("deal_agents").select("id, deal_id, agent_id")
          .eq("workspace_id", ws.id).order("id").range(from, from + CHUNK - 1);
        for (const line of data ?? []) {
          const deal = deals.get(line.deal_id);
          if (!deal) continue;
          const entry = activity.get(line.agent_id) ?? { open: 0, lastActivity: null };
          if (OPEN_STATUSES.includes(deal.status)) entry.open += 1;
          if (!entry.lastActivity || deal.updated_at > entry.lastActivity) entry.lastActivity = deal.updated_at;
          activity.set(line.agent_id, entry);
        }
        if (!data || data.length < CHUNK) break;
      }
    }
  }

  const scored = agents
    .map((agent) => ({ agent, ...riskScore(agent, activity.get(agent.id) ?? null, { seeCommission, seeDeals, today }) }))
    .sort((a, b) => b.score - a.score || a.agent.full_name.localeCompare(b.agent.full_name));
  const count = (band: string) => scored.filter((row) => row.band === band).length;
  const atRisk = scored.filter((row) => row.band !== "Healthy");

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Add-on · Retention Insights"
        title="Who to check in with"
        sub="Early signs that an agent may be drifting, read from this brokerage's own records. A prompt for a conversation, not a verdict."
      >
        <Link href="/exit-kit" className={ui.btn}>Exit kit</Link>
      </PageHeader>

      <section className={`${ui.card} ${ui.pad} ${ui.grid4}`} aria-label="Summary">
        <Stat label="High risk" value={count("High")} note={`score ${RISK_BANDS.high} or more`} />
        <Stat label="Watch" value={count("Watch")} note={`score ${RISK_BANDS.watch} to ${RISK_BANDS.high - 1}`} />
        <Stat label="Healthy" value={count("Healthy")} note={`score under ${RISK_BANDS.watch}`} />
        <Stat label="Agents read" value={scored.length} note="exited agents are left out" />
      </section>

      <Card title="Check in with these agents" aside={<span className={ui.soft}>{atRisk.length} of {scored.length}</span>}>
        {error ? (
          <Empty>The agents could not be loaded. Try again in a moment.</Empty>
        ) : atRisk.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Risk</th>
                  <th scope="col" className={ui.num}>Score</th>
                  <th scope="col">Why</th>
                  <th scope="col">Suggested opener</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map(({ agent, score, band, signals }) => (
                  <tr key={agent.id}>
                    <th scope="row" className={styles.rowHead}>
                      <span className={ui.strong}>{agent.full_name}</span>
                      <br />
                      <span className={ui.soft}>{agent.office ?? "No office"}</span>
                    </th>
                    <td><Badge tone={BAND_TONE[band]}>{band}</Badge></td>
                    <td className={ui.num}>{score}</td>
                    <td>
                      <ul className={ui.list}>
                        {signals.map((signal) => (
                          <li key={signal.key}>
                            {signal.label} <span className={ui.soft}>+{signal.points}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      <q>{suggestedOpener(agent.full_name.split(" ")[0] ?? agent.full_name, signals)}</q>
                      <br />
                      <Link href={`/exit-kit?agent=${agent.id}`} className={ui.soft}>
                        If they leave anyway, start the exit kit<span className="sr-only"> for {agent.full_name}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{scored.length ? "Nobody is showing early signs right now." : "There are no agents on file yet."}</Empty>
        )}
        <p className={ui.help}>
          Never quote the numbers to the agent. The openers are written without them on purpose: the conversation should feel
          like support, not surveillance.
        </p>
      </Card>

      <div className={ui.grid2}>
        <Card title="How the score is worked out">
          <p className={ui.help}>
            Each agent starts at 0. Points are added for each sign below and the total is capped at 100. A score of{" "}
            {RISK_BANDS.high} or more is High, {RISK_BANDS.watch} to {RISK_BANDS.high - 1} is Watch, and anything lower is
            Healthy.
          </p>
          <ul className={ui.list}>
            {RISK_RULES.map((rule) => (
              <li key={rule.text}>
                <span className={ui.strong}>+{rule.points}</span> {rule.text}
              </li>
            ))}
          </ul>
          {(!seeCommission || !seeDeals) && (
            <p className={ui.help}>
              For you, the score leaves out{" "}
              {[!seeDeals && "deal activity", !seeCommission && "commission movement"].filter(Boolean).join(" and ")}, because your
              role or this brokerage’s plan does
              not include it. Scores may be lower than a colleague sees.
            </p>
          )}
          <p className={ui.help}>
            Everything comes from this brokerage’s own agents, licences, onboarding and deals. Nothing is sent anywhere or
            bought in from outside.
          </p>
        </Card>

        <Card title="Check-in log">
          <Placeholder service="Check-in log storage">
            Logging a check-in (who spoke to the agent, when, the outcome and a note) needs its own table, which comes in a
            later database change. Until then nothing typed here would be kept, so the form is not shown.
          </Placeholder>
          <p className={ui.help}>Each check-in will record one of these outcomes, plus a short note:</p>
          <ul className={ui.list}>
            {CHECK_IN_OUTCOMES.map((outcome) => (
              <li key={outcome}>{outcome}</li>
            ))}
          </ul>
          <Empty>No check-ins have been logged yet.</Empty>
        </Card>
      </div>
    </div>
  );
}
