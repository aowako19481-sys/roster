import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/ActionForm";
import { DropZone } from "@/components/DropZone";
import { ButtonLink, Card, PageHeader, ui } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/access";
import { ADDONS, PLANS, TIMEZONES } from "@/lib/admin-pages";
import { BRAND } from "@/lib/brand";
import { todayIso } from "@/lib/format";
import { createBrokerage } from "../actions";

export const metadata: Metadata = { title: "New brokerage" };

export default async function NewBrokeragePage() {
  await requirePlatformAdmin();
  const thisMonth = todayIso().slice(0, 7);
  return (
    <div className={ui.stack}>
      <PageHeader eyebrow={`${BRAND} staff`} title="New brokerage" sub="Set up the account, and file the invoice you sent so its record starts complete.">
        <ButtonLink href="/kinu">All brokerages</ButtonLink>
      </PageHeader>

      <ActionForm action={createBrokerage} className={ui.stack}>
        <Card title="1. The account">
          <div className={ui.form}>
            <div className={ui.formRow}>
              <label className={ui.field}>
                Brokerage name
                <input className={ui.input} name="name" required minLength={2} maxLength={120} autoComplete="off" />
              </label>
              <label className={ui.field}>
                Time zone
                <select className={ui.select} name="timezone" defaultValue="America/New_York">
                  {TIMEZONES.map((zone) => (
                    <option key={zone.value} value={zone.value}>{zone.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className={ui.field}>
              Main admin’s work email (their IT lead or owner)
              <input className={ui.input} name="owner_email" type="email" maxLength={254} autoComplete="off" aria-describedby="owner-help" />
            </label>
            <p id="owner-help" className={ui.help}>
              This person becomes the brokerage’s Owner / Admin. They sign in with this email and create every other role
              for their own people: managers, finance, operations, auditors. They only ever see their own brokerage.
            </p>
          </div>
        </Card>

        <Card title="2. Plan and seats">
          <div className={ui.form}>
            <div className={ui.formRow}>
              <label className={ui.field}>
                Plan
                <select className={ui.select} name="plan" defaultValue="standard">
                  {PLANS.map((plan) => (
                    <option key={plan.key} value={plan.key}>{plan.label} · {plan.blurb}</option>
                  ))}
                </select>
              </label>
              <label className={ui.field}>
                Quoted price per month (leave empty to use list prices)
                <input className={ui.input} name="quote" inputMode="decimal" placeholder="$" maxLength={12} />
              </label>
            </div>
            <div className={ui.formRow}>
              <label className={ui.field}>
                Agent seats in the contract (leave empty for no limit)
                <input className={ui.input} name="agent_seats" inputMode="numeric" maxLength={7} />
              </label>
              <label className={ui.field}>
                Owner / Admin seats
                <input className={ui.input} name="owner_seats" inputMode="numeric" defaultValue="1" required maxLength={3} />
              </label>
            </div>
            <p className={ui.help}>
              Seats cover the whole brokerage, however many offices and teams it has. One Owner / Admin seat is the
              default; the brokerage cannot add another until you raise the number here.
            </p>
            <fieldset className={ui.inline} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className={ui.help}>Products</legend>
              <label className={ui.check}><input type="checkbox" name="ops" defaultChecked /><span>Ops</span></label>
              <label className={ui.check}><input type="checkbox" name="finance" defaultChecked /><span>Finance</span></label>
            </fieldset>
            <fieldset className={ui.inline} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className={ui.help}>Add-ons</legend>
              {ADDONS.map((addon) => (
                <label key={addon.key} className={ui.check}><input type="checkbox" name={`addon_${addon.key}`} /><span>{addon.label}</span></label>
              ))}
            </fieldset>
          </div>
        </Card>

        <Card title="3. First invoice and payment" aside={<span className={ui.soft}>Filed under this brokerage</span>}>
          <div className={ui.form}>
            <div className={ui.formRow}>
              <label className={ui.field}>
                Invoice for the month of
                <input className={ui.input} name="month" type="month" defaultValue={thisMonth} required />
              </label>
              <label className={ui.field}>
                Invoice amount
                <input className={ui.input} name="amount" inputMode="decimal" required placeholder="$" maxLength={12} />
              </label>
              <label className={ui.field}>
                Invoice number
                <input className={ui.input} name="invoice_no" maxLength={60} autoComplete="off" />
              </label>
            </div>
            <DropZone name="invoice" label="The invoice you sent the client (required)" required />
            <DropZone name="proof" label="Proof of payment from Square (add now, or later from the brokerage’s file)" />
            <div className={ui.formRow}>
              <label className={ui.field}>
                Square payment reference
                <input className={ui.input} name="payment_ref" maxLength={80} autoComplete="off" />
              </label>
              <label className={ui.field}>
                Paid on
                <input className={ui.input} name="paid_on" type="date" />
              </label>
            </div>
          </div>
        </Card>

        <Card title="4. Contract (optional now)">
          <div className={ui.form}>
            <DropZone name="contract" label="The signed contract" />
            <div className={ui.formRow}>
              <label className={ui.field}>
                Starts
                <input className={ui.input} name="contract_start" type="date" />
              </label>
              <label className={ui.field}>
                Ends
                <input className={ui.input} name="contract_end" type="date" />
              </label>
            </div>
          </div>
        </Card>

        <div>
          <Submit busy="Creating…">Create brokerage</Submit>
        </div>
      </ActionForm>
    </div>
  );
}
