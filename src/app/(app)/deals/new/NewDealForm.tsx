"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { Badge, ui } from "@/components/ui";
import { DEAL_TYPES, FEE_KINDS, PARTY_KINDS, dealStatusLabel, dealStatusTone, dealTypeLabel } from "@/lib/finance";
import { money } from "@/lib/format";
import { createDeal, type DealFormState } from "../actions";

type Party = { key: number; kind: string; name: string };
type Line = { key: number; agent: string; basis: string; share: string; split: string };
type Fee = { key: number; kind: string; payee: string; amount: string };

const START: DealFormState = { ok: null };

type RiderSplits = Record<string, { individual: number | null; team: number | null }>;
const amount = (value: string) => { const n = Number(value.replace(/[$,\s]/g, "")); return Number.isFinite(n) && n >= 0 ? n : 0; };
const percent = (value: string) => { const n = Number(value.replace(/[%\s]/g, "")); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0; };
const cents = (n: number) => Math.round(n * 100) / 100;

export function NewDealForm({ agents, offices, riders, prefill }: { agents: { id: string; label: string }[]; offices: { id: string; name: string }[]; riders: RiderSplits; prefill: boolean }) {
  const [state, action, pending] = useActionState(createDeal, START);
  const nextKey = useRef(1);
  const key = () => { nextKey.current += 1; return nextKey.current; };

  const [basics, setBasics] = useState({ address: "", deal_type: "", gci: "", deposit_date: "", office_id: "", pp_number: "" });
  const [parties, setParties] = useState<Party[]>([]);
  const [lines, setLines] = useState<Line[]>([{ key: 1, agent: "", basis: "individual", share: "100", split: "" }]);
  const [fees, setFees] = useState<Fee[]>([]);

  const basic = (name: keyof typeof basics) => ({
    name,
    value: basics[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setBasics((b) => ({ ...b, [name]: event.target.value })),
  });
  const patch = <T extends { key: number }>(set: React.Dispatch<React.SetStateAction<T[]>>, rowKey: number, change: Partial<T>) =>
    set((rows) => rows.map((row) => (row.key === rowKey ? { ...row, ...change } : row)));
  const drop = <T extends { key: number }>(set: React.Dispatch<React.SetStateAction<T[]>>, rowKey: number) =>
    set((rows) => rows.filter((row) => row.key !== rowKey));

  // Submitted by hand so that a refusal (or the "Is this a dual?" question) does not clear what was typed.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name) data.set(submitter.name, submitter.value);
    startTransition(() => action(data));
  };

  const shareTotal = Math.round(lines.reduce((sum, line) => sum + (Number(line.share) || 0), 0) * 100) / 100;

  const riderOf = (agent: string, basis: string) => (agent ? riders[agent]?.[basis === "team" ? "team" : "individual"] ?? null : null);
  // Choosing an agent (or how they are paid) fills in their split from the signed rider, if this brokerage wants that.
  const choose = (line: Line, change: { agent?: string; basis?: string }) => {
    const next = { ...line, ...change };
    const rider = riderOf(next.agent, next.basis);
    const wasRider = line.split === "" || Number(line.split) === riderOf(line.agent, line.basis);
    patch(setLines, line.key, { ...change, ...(prefill && rider !== null && wasRider ? { split: String(rider) } : {}) });
  };
  // Add an agent: the shares are spread evenly until someone types their own.
  const even = lines.every((line, _, all) => line.share === "" || Math.abs(Number(line.share) - cents(100 / all.length)) < 0.02 || (all.length === 1 && line.share === "100"));
  const addAgent = () => setLines((rows) => {
    const count = rows.length + 1;
    const each = String(cents(100 / count));
    const spread = even ? rows.map((row) => ({ ...row, share: each })) : rows;
    return [...spread, { key: key(), agent: "", basis: "individual", share: even ? String(cents(100 - Number(each) * (count - 1))) : "", split: "" }];
  });

  // Who gets what, worked out as the numbers are typed. The database works it out again when the deal is saved.
  const gci = amount(basics.gci);
  const feesTotal = cents(fees.reduce((sum, fee) => sum + amount(fee.amount), 0));
  const net = Math.max(0, cents(gci - feesTotal));
  const breakdown = lines.map((line) => {
    const share = cents(net * percent(line.share) / 100);
    const toAgent = cents(share * percent(line.split) / 100);
    const rider = riderOf(line.agent, line.basis);
    return { key: line.key, name: agents.find((agent) => agent.id === line.agent)?.label.split(" · ")[0] ?? "", share, split: percent(line.split), toAgent, toBrokerage: cents(share - toAgent), rider, differs: line.split !== "" && rider !== null && Number(line.split) !== rider };
  });
  const toAgents = cents(breakdown.reduce((sum, row) => sum + row.toAgent, 0));
  const duplicates = state.ok === false ? state.duplicates : undefined;

  return (
    <form onSubmit={onSubmit} className={ui.form} noValidate>
      <div className={ui.formRow}>
        <label className={ui.field} style={{ gridColumn: "span 2" }}>
          Address
          <input className={ui.input} {...basic("address")} required maxLength={200} autoComplete="off" />
        </label>
        <label className={ui.field}>
          Type (required)
          <select className={ui.select} {...basic("deal_type")} required>
            <option value="">Choose…</option>
            {DEAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
      </div>
      <div className={ui.formRow}>
        <label className={ui.field}>
          GCI ($)
          <input className={ui.input} {...basic("gci")} inputMode="decimal" required maxLength={20} />
        </label>
        <label className={ui.field}>
          Deposit date
          <input className={ui.input} type="date" {...basic("deposit_date")} />
        </label>
        <label className={ui.field}>
          Office
          <select className={ui.select} {...basic("office_id")}>
            <option value="">No office</option>
            {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
          </select>
        </label>
        <label className={ui.field}>
          PP number
          <input className={ui.input} {...basic("pp_number")} maxLength={40} autoComplete="off" />
        </label>
      </div>

      <fieldset className={ui.form} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={ui.h2}>Parties</legend>
        <p className={ui.help}>Any number of landlords, tenants, sellers and buyers.</p>
        {parties.map((party, i) => (
          <div key={party.key} className={ui.inline}>
            <label className={ui.field}>
              Party {i + 1}
              <select className={ui.select} name={`party${i}_kind`} value={party.kind} onChange={(e) => patch(setParties, party.key, { kind: e.target.value })}>
                {PARTY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </label>
            <label className={ui.field} style={{ flex: "1 1 240px" }}>
              Name
              <input className={ui.input} name={`party${i}_name`} value={party.name} maxLength={160} onChange={(e) => patch(setParties, party.key, { name: e.target.value })} />
            </label>
            <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => drop(setParties, party.key)} aria-label={`Remove party ${i + 1}`}>Remove</button>
          </div>
        ))}
        <div>
          <button type="button" className={`${ui.btn} ${ui.small}`} disabled={parties.length >= 40} onClick={() => setParties((rows) => [...rows, { key: key(), kind: "landlord", name: "" }])}>
            Add a party
          </button>
        </div>
      </fieldset>

      <fieldset className={ui.form} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={ui.h2}>Agents</legend>
        <p className={ui.help}>
          {prefill
            ? "Each split is filled in from the agent’s signed rider. Change it if the notice of contract says something different: a difference is flagged for review."
            : "Type each split exactly as it is on the notice of contract. The rider is what it is checked against."}
        </p>
        {lines.map((line, i) => (
          <div key={line.key} className={ui.inline}>
            <label className={ui.field} style={{ flex: "2 1 220px" }}>
              Agent {i + 1}
              <select className={ui.select} name={`line${i}_agent`} value={line.agent} onChange={(e) => choose(line, { agent: e.target.value })} required>
                <option value="">Choose an agent…</option>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.label}</option>)}
              </select>
            </label>
            <label className={ui.field}>
              Paid as
              <select className={ui.select} name={`line${i}_basis`} value={line.basis} onChange={(e) => choose(line, { basis: e.target.value })}>
                <option value="individual">Individual</option>
                <option value="team">Team</option>
              </select>
            </label>
            <label className={ui.field} style={{ flex: "0 1 130px" }}>
              Share of deal (%)
              <input className={ui.input} name={`line${i}_share`} value={line.share} inputMode="decimal" maxLength={8} onChange={(e) => patch(setLines, line.key, { share: e.target.value })} required />
            </label>
            <label className={ui.field} style={{ flex: "0 1 130px" }}>
              Split (%)
              <input className={ui.input} name={`line${i}_split`} value={line.split} inputMode="decimal" maxLength={8} onChange={(e) => patch(setLines, line.key, { split: e.target.value })} required />
            </label>
            {lines.length > 1 && (
              <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => drop(setLines, line.key)} aria-label={`Remove agent ${i + 1}`}>Remove</button>
            )}
          </div>
        ))}
        <div className={ui.inline} style={{ alignItems: "center" }}>
          <button type="button" className={`${ui.btn} ${ui.small}`} disabled={lines.length >= 40} onClick={addAgent}>
            Add an agent
          </button>
          <span className={ui.soft} role="status">
            Shares total {shareTotal}%{shareTotal === 100 ? "." : ". They must total 100%."}
          </span>
        </div>
      </fieldset>

      <fieldset className={ui.form} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={ui.h2}>Money out</legend>
        <p className={ui.help}>Referral fees show on the deposit record. Outside-brokerage fees do not. Both come off the GCI before anyone is paid.</p>
        {fees.map((fee, i) => (
          <div key={fee.key} className={ui.inline}>
            <label className={ui.field}>
              Fee {i + 1}
              <select className={ui.select} name={`fee${i}_kind`} value={fee.kind} onChange={(e) => patch(setFees, fee.key, { kind: e.target.value })}>
                {FEE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </label>
            <label className={ui.field} style={{ flex: "1 1 220px" }}>
              Paid to
              <input className={ui.input} name={`fee${i}_payee`} value={fee.payee} maxLength={160} onChange={(e) => patch(setFees, fee.key, { payee: e.target.value })} />
            </label>
            <label className={ui.field} style={{ flex: "0 1 150px" }}>
              Amount ($)
              <input className={ui.input} name={`fee${i}_amount`} value={fee.amount} inputMode="decimal" maxLength={20} onChange={(e) => patch(setFees, fee.key, { amount: e.target.value })} />
            </label>
            <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => drop(setFees, fee.key)} aria-label={`Remove fee ${i + 1}`}>Remove</button>
          </div>
        ))}
        <div className={ui.inline}>
          <button type="button" className={`${ui.btn} ${ui.small}`} disabled={fees.length >= 20} onClick={() => setFees((rows) => [...rows, { key: key(), kind: "referral", payee: "", amount: "" }])}>
            Add a referral fee
          </button>
          <button type="button" className={`${ui.btn} ${ui.small}`} disabled={fees.length >= 20} onClick={() => setFees((rows) => [...rows, { key: key(), kind: "outside", payee: "", amount: "" }])}>
            Add an outside-brokerage fee
          </button>
        </div>
      </fieldset>

      <section aria-labelledby="breakdown-title" className={ui.placeholder} style={{ borderStyle: "solid" }}>
        <h3 id="breakdown-title" className={ui.h2}>Who gets what</h3>
        <div className={ui.tableWrap} aria-live="polite">
          <table className={ui.table}>
            <tbody>
              <tr><th scope="row">Gross commission (GCI)</th><td className={ui.num}>{money(gci)}</td><td /></tr>
              {feesTotal > 0 ? <tr><th scope="row">Less referral and outside fees</th><td className={ui.num}>− {money(feesTotal)}</td><td /></tr> : null}
              <tr><th scope="row">To be split</th><td className={ui.num}><strong>{money(net)}</strong></td><td /></tr>
              {breakdown.map((row, index) => (
                <tr key={row.key}>
                  <th scope="row">
                    {row.name || `Agent ${index + 1}`}
                    <br />
                    <span className={ui.soft}>
                      {money(row.share)} share × {row.split}%
                      {row.rider === null ? (row.name ? " · no signed rider on file" : "") : row.differs ? ` · signed rider says ${row.rider}%` : " · matches the signed rider"}
                    </span>
                  </th>
                  <td className={ui.num}><strong>{money(row.toAgent)}</strong></td>
                  <td className={ui.soft}>{row.differs ? "Will be flagged for review" : ""}</td>
                </tr>
              ))}
              <tr><th scope="row">Brokerage keeps</th><td className={ui.num}><strong>{money(cents(net - toAgents))}</strong></td><td /></tr>
            </tbody>
          </table>
        </div>
        <p className={ui.help}>Worked out as you type. The final figures are calculated again and checked against each rider when you save.</p>
      </section>

      {duplicates?.length ? (
        <section role="alert" aria-labelledby="dual-title" className={ui.placeholder} style={{ borderStyle: "solid" }}>
          <h3 id="dual-title" className={ui.h2}>Is this a dual?</h3>
          <p className={ui.help}>
            {duplicates.length === 1 ? "A deal" : `${duplicates.length} deals`} at this address {duplicates.length === 1 ? "is" : "are"} already on file.
            If this is the other side of the same transaction, save it as its own deal. If it is the same deal entered twice, open the existing one instead.
          </p>
          <ul className={ui.list}>
            {duplicates.map((deal) => (
              <li key={deal.id} className={ui.inline} style={{ alignItems: "center" }}>
                <Link href={`/deals/${deal.id}`} className={ui.rowLink}>Go to {deal.address}</Link>
                <span className={ui.soft}>{dealTypeLabel(deal.deal_type)} · {money(deal.gci)}</span>
                <Badge tone={dealStatusTone(deal.status)}>{dealStatusLabel(deal.status)}</Badge>
              </li>
            ))}
          </ul>
          <div className={ui.inline} style={{ marginTop: 12 }}>
            <button type="submit" name="confirm_dual" value="yes" className={ui.btnPrimary} disabled={pending}>
              {pending ? "Saving…" : "Yes, save as its own deal"}
            </button>
          </div>
        </section>
      ) : (
        <p role="alert" className={ui.error}>{state.ok === false ? state.message : ""}</p>
      )}

      <div className={ui.inline}>
        <button type="submit" className={duplicates?.length ? ui.btn : ui.btnPrimary} disabled={pending}>
          {pending ? "Saving…" : duplicates?.length ? "Check again" : "Save deal"}
        </button>
        <Link href="/deals" className={ui.linkBtn}>Cancel</Link>
      </div>
    </form>
  );
}
