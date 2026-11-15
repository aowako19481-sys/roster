"use client";

import { useRef, useState } from "react";
import { ui } from "@/components/ui";
import { scratchCalc } from "@/lib/finance";
import { money } from "@/lib/format";

type AgentRow = { key: number; name: string; share: string; split: string };
type FeeRow = { key: number; kind: "referral" | "outside"; payee: string; amount: string };
type PartRow = { key: number; label: string; amount: string };

const read = (value: string) => {
  const n = Number(value.replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function useKeys(start: number) {
  const next = useRef(start);
  return () => {
    next.current += 1;
    return next.current;
  };
}

export function Calculator() {
  const newKey = useKeys(10);
  const [gci, setGci] = useState("");
  const [agents, setAgents] = useState<AgentRow[]>([{ key: 1, name: "", share: "100", split: "" }]);
  const [fees, setFees] = useState<FeeRow[]>([]);

  const result = scratchCalc(read(gci), fees.map((fee) => read(fee.amount)), agents.map((agent) => ({ share: read(agent.share), split: read(agent.split) })));
  const referral = scratchCalc(0, fees.filter((fee) => fee.kind === "referral").map((fee) => read(fee.amount)), []).fees;
  const outside = scratchCalc(0, fees.filter((fee) => fee.kind === "outside").map((fee) => read(fee.amount)), []).fees;
  const shareTotal = Math.round(agents.reduce((sum, agent) => sum + Math.min(read(agent.share), 100), 0) * 100) / 100;
  const feesOver = result.fees > read(gci);

  const patchAgent = (key: number, change: Partial<AgentRow>) => setAgents((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const patchFee = (key: number, change: Partial<FeeRow>) => setFees((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const addAgent = () => { const key = newKey(); setAgents((rows) => [...rows, { key, name: "", share: "", split: "" }]); };
  const addFee = (kind: FeeRow["kind"]) => { const key = newKey(); setFees((rows) => [...rows, { key, kind, payee: "", amount: "" }]); };

  return (
    <div className={ui.split}>
      <div className={ui.form}>
        <label className={ui.field} style={{ maxWidth: 260 }}>
          GCI ($)
          <input className={ui.input} inputMode="decimal" value={gci} onChange={(e) => setGci(e.target.value)} maxLength={20} />
        </label>

        <fieldset className={ui.form} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={ui.h2}>Agents</legend>
          {agents.map((agent, i) => (
            <div key={agent.key} className={ui.inline}>
              <label className={ui.field} style={{ flex: "2 1 180px" }}>
                Agent {i + 1} (name, optional)
                <input className={ui.input} value={agent.name} maxLength={80} onChange={(e) => patchAgent(agent.key, { name: e.target.value })} />
              </label>
              <label className={ui.field} style={{ flex: "0 1 120px" }}>
                Share (%)
                <input className={ui.input} inputMode="decimal" value={agent.share} maxLength={8} onChange={(e) => patchAgent(agent.key, { share: e.target.value })} />
              </label>
              <label className={ui.field} style={{ flex: "0 1 120px" }}>
                Split (%)
                <input className={ui.input} inputMode="decimal" value={agent.split} maxLength={8} onChange={(e) => patchAgent(agent.key, { split: e.target.value })} />
              </label>
              {agents.length > 1 && (
                <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => setAgents((rows) => rows.filter((row) => row.key !== agent.key))} aria-label={`Remove agent ${i + 1}`}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <div className={ui.inline} style={{ alignItems: "center" }}>
            <button type="button" className={`${ui.btn} ${ui.small}`} onClick={addAgent} disabled={agents.length >= 20}>Add an agent</button>
            <span className={ui.soft}>Shares total {shareTotal}%{shareTotal === 100 ? "." : ". On a deal sheet they must total 100%."}</span>
          </div>
        </fieldset>

        <fieldset className={ui.form} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={ui.h2}>Fees out</legend>
          {fees.map((fee, i) => (
            <div key={fee.key} className={ui.inline}>
              <label className={ui.field}>
                Fee {i + 1}
                <select className={ui.select} value={fee.kind} onChange={(e) => patchFee(fee.key, { kind: e.target.value === "outside" ? "outside" : "referral" })}>
                  <option value="referral">Referral fee</option>
                  <option value="outside">Outside-brokerage fee</option>
                </select>
              </label>
              <label className={ui.field} style={{ flex: "1 1 160px" }}>
                Paid to (optional)
                <input className={ui.input} value={fee.payee} maxLength={80} onChange={(e) => patchFee(fee.key, { payee: e.target.value })} />
              </label>
              <label className={ui.field} style={{ flex: "0 1 140px" }}>
                Amount ($)
                <input className={ui.input} inputMode="decimal" value={fee.amount} maxLength={20} onChange={(e) => patchFee(fee.key, { amount: e.target.value })} />
              </label>
              <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => setFees((rows) => rows.filter((row) => row.key !== fee.key))} aria-label={`Remove fee ${i + 1}`}>
                Remove
              </button>
            </div>
          ))}
          <div className={ui.inline}>
            <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => addFee("referral")} disabled={fees.length >= 20}>Add a referral fee</button>
            <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => addFee("outside")} disabled={fees.length >= 20}>Add an outside-brokerage fee</button>
          </div>
        </fieldset>
      </div>

      <div aria-live="polite" aria-atomic="true">
        <h3 className={ui.h2}>Result</h3>
        <dl className={ui.kv} style={{ marginTop: 14 }}>
          <dt>GCI</dt>
          <dd>{money(read(gci))}</dd>
          <dt>Referral amount</dt>
          <dd>{money(referral)}</dd>
          <dt>Outside-brokerage fees</dt>
          <dd>{money(outside)}</dd>
          <dt>Net (GCI less all fees)</dt>
          <dd className={ui.strong}>{money(result.net)}</dd>
          {agents.map((agent, i) => (
            <div key={agent.key} style={{ display: "contents" }}>
              <dt>Payout: {agent.name.trim() || `Agent ${i + 1}`}</dt>
              <dd className={ui.strong}>{money(result.payouts[i])}</dd>
            </div>
          ))}
          <dt>Company dollar</dt>
          <dd><span className={ui.statValue}>{money(result.companyDollar)}</span></dd>
        </dl>
        {feesOver && <p className={ui.help} style={{ marginTop: 10 }}>The fees are more than the GCI, so the net is $0.00 (it never goes below zero).</p>}
        <p className={ui.help} style={{ marginTop: 14 }}>
          The rule, the same one the database uses: net = GCI less all fees, never below zero. Each payout = net × share × split, rounded to the
          cent. Company dollar = net less every payout.
        </p>
      </div>
    </div>
  );
}

export function WireSplitter() {
  const newKey = useKeys(10);
  const [wire, setWire] = useState("");
  const [parts, setParts] = useState<PartRow[]>([{ key: 1, label: "", amount: "" }, { key: 2, label: "", amount: "" }]);

  const cents = (value: string) => Math.round(read(value) * 100);
  const total = cents(wire);
  const used = parts.reduce((sum, part) => sum + cents(part.amount), 0);
  const left = (total - used) / 100;
  const patch = (key: number, change: Partial<PartRow>) => setParts((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const add = () => { const key = newKey(); setParts((rows) => [...rows, { key, label: "", amount: "" }]); };

  return (
    <div className={ui.split}>
      <div className={ui.form}>
        <label className={ui.field} style={{ maxWidth: 260 }}>
          Wire total ($)
          <input className={ui.input} inputMode="decimal" value={wire} onChange={(e) => setWire(e.target.value)} maxLength={20} />
        </label>
        {parts.map((part, i) => (
          <div key={part.key} className={ui.inline}>
            <label className={ui.field} style={{ flex: "2 1 220px" }}>
              Deal {i + 1} (address, optional)
              <input className={ui.input} value={part.label} maxLength={120} onChange={(e) => patch(part.key, { label: e.target.value })} />
            </label>
            <label className={ui.field} style={{ flex: "0 1 160px" }}>
              Amount ($)
              <input className={ui.input} inputMode="decimal" value={part.amount} maxLength={20} onChange={(e) => patch(part.key, { amount: e.target.value })} />
            </label>
            {parts.length > 1 && (
              <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => setParts((rows) => rows.filter((row) => row.key !== part.key))} aria-label={`Remove deal ${i + 1}`}>
                Remove
              </button>
            )}
          </div>
        ))}
        <div><button type="button" className={`${ui.btn} ${ui.small}`} onClick={add} disabled={parts.length >= 30}>Add a deal</button></div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        <h3 className={ui.h2}>Result</h3>
        <dl className={ui.kv} style={{ marginTop: 14 }}>
          <dt>Wire total</dt>
          <dd>{money(total / 100)}</dd>
          <dt>Placed on {parts.length} {parts.length === 1 ? "deal" : "deals"}</dt>
          <dd>{money(used / 100)}</dd>
          <dt>{left < 0 ? "Over by" : "Remainder"}</dt>
          <dd><span className={ui.statValue}>{money(Math.abs(left))}</span></dd>
        </dl>
        <p className={ui.help} style={{ marginTop: 10 }}>
          {total === 0
            ? "Enter the wire total and the amount for each deal."
            : left === 0
              ? "The parts add up to the wire exactly."
              : left > 0
                ? "Not all of the wire has been placed yet."
                : "The parts add up to more than the wire."}
        </p>
        <p className={ui.help} style={{ marginTop: 10 }}>To record a real wire across several deals, use Add payment on the Payments page.</p>
      </div>
    </div>
  );
}
