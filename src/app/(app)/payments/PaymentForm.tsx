"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { ui } from "@/components/ui";
import { PAYMENT_METHODS } from "@/lib/finance";
import { money } from "@/lib/format";
import { recordPayment, type PaymentState } from "./actions";

type DealOption = { id: string; label: string };
type Part = { key: number; deal: string; amount: string };
type State = PaymentState & { saved: number };

async function submit(prev: State, form: FormData): Promise<State> {
  const result = await recordPayment({ ok: null }, form);
  return { ...result, saved: prev.saved + (result.ok ? 1 : 0) };
}

const amountOf = (value: string) => {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function Fields({ deals, preselect, today, pending, askDual }: { deals: DealOption[]; preselect: string; today: string; pending: boolean; askDual: boolean }) {
  const nextKey = useRef(1);
  const [amount, setAmount] = useState("");
  const [parts, setParts] = useState<Part[]>([{ key: 1, deal: preselect, amount: "" }]);
  const patch = (rowKey: number, change: Partial<Part>) => setParts((rows) => rows.map((row) => (row.key === rowKey ? { ...row, ...change } : row)));
  const add = () => {
    nextKey.current += 1;
    const key = nextKey.current;
    setParts((rows) => [...rows, { key, deal: "", amount: "" }]);
  };

  const total = Math.round(amountOf(amount) * 100);
  const used = parts.reduce((sum, part) => sum + Math.round(amountOf(part.amount) * 100), 0);
  const left = (total - used) / 100;

  return (
    <>
      <div className={ui.formRow}>
        <label className={ui.field}>
          Method
          <select className={ui.select} name="method" defaultValue="" required>
            <option value="" disabled>Choose…</option>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className={ui.field}>
          Amount ($)
          <input className={ui.input} name="amount" inputMode="decimal" maxLength={20} required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className={ui.field}>
          Date received
          <input className={ui.input} type="date" name="received_on" defaultValue={today} required />
        </label>
        <label className={ui.field}>
          Reference (check or wire number)
          <input className={ui.input} name="reference" maxLength={80} autoComplete="off" />
        </label>
      </div>

      <label className={ui.field}>
        Proof (optional): PDF, JPEG, PNG or WebP, 10 MB at most
        <input className={ui.input} type="file" name="proof" accept="application/pdf,image/jpeg,image/png,image/webp" style={{ paddingTop: 9 }} />
      </label>

      <fieldset className={ui.form} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={ui.h2}>Which deals is it for?</legend>
        <p className={ui.help}>Choose each deal by its address. One payment can cover several addresses; the parts must add up to the payment.</p>
        {parts.map((part, i) => (
          <div key={part.key} className={ui.inline}>
            <label className={ui.field} style={{ flex: "2 1 300px" }}>
              Deal {i + 1} (by address)
              <select className={ui.select} name={`alloc${i}_deal`} value={part.deal} onChange={(e) => patch(part.key, { deal: e.target.value })} required>
                <option value="">Choose a deal…</option>
                {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.label}</option>)}
              </select>
            </label>
            <label className={ui.field} style={{ flex: "0 1 170px" }}>
              Amount for this deal ($)
              <input className={ui.input} name={`alloc${i}_amount`} inputMode="decimal" maxLength={20} value={part.amount} onChange={(e) => patch(part.key, { amount: e.target.value })} required />
            </label>
            {parts.length > 1 && (
              <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => setParts((rows) => rows.filter((row) => row.key !== part.key))} aria-label={`Remove deal ${i + 1}`}>
                Remove
              </button>
            )}
          </div>
        ))}
        <div className={ui.inline} style={{ alignItems: "center" }}>
          <button type="button" className={`${ui.btn} ${ui.small}`} onClick={add} disabled={parts.length >= 30}>Split across another deal</button>
          <span className={ui.soft} role="status">
            {total === 0 ? "Enter the payment amount." : left === 0 ? "The parts add up to the payment." : left > 0 ? `${money(left)} still to place.` : `${money(-left)} too much placed.`}
          </span>
        </div>
      </fieldset>

      <div className={ui.inline}>
        {askDual ? (
          <>
            <button type="submit" name="confirm_duplicate" value="yes" className={ui.btnPrimary} disabled={pending}>
              {pending ? "Working…" : "Yes, record it as its own payment"}
            </button>
            <button type="submit" className={ui.btn} disabled={pending}>Check again</button>
          </>
        ) : (
          <button type="submit" className={ui.btnPrimary} disabled={pending}>{pending ? "Working…" : "Record payment"}</button>
        )}
      </div>
    </>
  );
}

export function PaymentForm({ deals, preselect, today }: { deals: DealOption[]; preselect: string; today: string }) {
  const [state, dispatch, pending] = useActionState(submit, { ok: null, saved: 0 });

  // Submitted by hand so that a refusal does not clear what was typed (or the chosen file).
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name) data.set(submitter.name, submitter.value);
    startTransition(() => dispatch(data));
  };

  return (
    <form onSubmit={onSubmit} className={ui.form} noValidate>
      <Fields key={state.saved} deals={deals} preselect={preselect} today={today} pending={pending} askDual={state.ok === false && Boolean(state.duplicate)} />
      <p role="alert" className={ui.error}>{state.ok === false ? state.message : ""}</p>
      <p role="status" className={ui.success}>{state.ok === true ? state.message : ""}</p>
    </form>
  );
}
