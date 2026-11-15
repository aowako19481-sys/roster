import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/ActionForm";
import { ui } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { day, pct } from "@/lib/format";
import { loadPortal, type PortalState } from "@/lib/portal";
import { detailsStep, licenceStep, riderStep, w9Step } from "./actions";
import styles from "./portal.module.css";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }> };
type StepKey = "details" | "licence" | "w9" | "rider";

function stepsOf(state: PortalState): { key: StepKey; label: string; done: boolean }[] {
  return [
    { key: "details", label: "Your details", done: state.details_done },
    { key: "licence", label: "Licence", done: state.licence_status !== "not_uploaded" },
    { key: "w9", label: "W-9", done: state.w9_status !== "pending" },
    { key: "rider", label: "Sign your rider", done: state.rider_status === "signed" },
  ];
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <span className={`brandType ${styles.mark}`}>{BRAND}</span>
      </header>
      <main id="content" className={styles.main}>
        {children}
      </main>
    </div>
  );
}

export default async function WelcomePage({ params }: Props) {
  const { token } = await params;
  const lookup = await loadPortal(token);

  if (lookup.kind !== "ok") {
    return (
      <Shell>
        <div className={styles.card}>
          <h1 className={styles.title}>{lookup.kind === "off" ? "Not open yet" : "This link has expired"}</h1>
          <p className={styles.lede}>
            {lookup.kind === "off"
              ? "Onboarding is not switched on for this site yet. Please check back with your brokerage."
              : "Onboarding links work for 14 days and each new link replaces the last. Ask your brokerage to send you a new one."}
          </p>
        </div>
      </Shell>
    );
  }

  const state = lookup.state;
  const steps = stepsOf(state);
  const current = steps.find((step) => !step.done)?.key ?? null;
  const finished = current === null;

  return (
    <Shell>
      <div className={styles.intro}>
        <p className={`brandLabel ${styles.eyebrow}`}>{state.brokerage}</p>
        <h1 className={styles.title}>
          {finished ? "You are all set," : "Welcome,"} {state.full_name.split(" ")[0]}
        </h1>
        <p className={styles.lede}>
          {finished
            ? "Everything is in. Your brokerage will confirm your licence and let you know when you are live."
            : "Four short steps and you are ready to go. You can stop and come back with the same link."}
        </p>
        <ol className={styles.steps} aria-label="Onboarding steps">
          {steps.map((step, index) => (
            <li key={step.key} className={step.done ? styles.stepDone : step.key === current ? styles.stepNow : styles.stepTodo} aria-current={step.key === current ? "step" : undefined}>
              <span className={styles.stepNo} aria-hidden="true">
                {step.done ? "✓" : index + 1}
              </span>
              <span>
                {step.label}
                <span className="sr-only">{step.done ? " (done)" : step.key === current ? " (current step)" : " (not started)"}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.card}>
        {current === "details" && (
          <ActionForm action={detailsStep}>
            <h2 className={styles.h2}>Your details</h2>
            <p className={ui.help}>Check your name is spelled the way it appears on your licence.</p>
            <input type="hidden" name="token" value={token} />
            <label className={ui.field}>
              Full name
              <input className={ui.input} name="full_name" defaultValue={state.full_name} autoComplete="name" required maxLength={120} />
            </label>
            <label className={ui.field}>
              Mobile phone
              <input className={ui.input} name="phone" type="tel" defaultValue={state.phone ?? ""} autoComplete="tel" inputMode="tel" required maxLength={30} placeholder="(212) 555-0100" />
            </label>
            <dl className={ui.kv}>
              <dt>Email</dt>
              <dd>{state.email ?? "–"}</dd>
              <dt>Office</dt>
              <dd>{state.office}</dd>
            </dl>
            <Submit>Continue</Submit>
          </ActionForm>
        )}

        {current === "licence" && (
          <ActionForm action={licenceStep}>
            <h2 className={styles.h2}>Your licence</h2>
            <p className={ui.help}>
              Enter the number and expiry date from your real estate licence and add a photo of it. Someone at your
              brokerage checks it against the state record.
            </p>
            <input type="hidden" name="token" value={token} />
            <div className={ui.formRow}>
              <label className={ui.field}>
                Licence number
                <input className={ui.input} name="number" required maxLength={30} autoComplete="off" spellCheck={false} />
              </label>
              <label className={ui.field}>
                State
                <input className={ui.input} name="state" defaultValue="NY" maxLength={2} autoCapitalize="characters" />
              </label>
            </div>
            <label className={ui.field}>
              Expiry date
              <input className={ui.input} name="expires" type="date" required />
            </label>
            <label className={ui.field}>
              Photo of your licence (JPEG, PNG, WebP or PDF, up to 10 MB)
              <input className={styles.file} name="photo" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
            </label>
            <Submit busy="Saving…">Continue</Submit>
          </ActionForm>
        )}

        {current === "w9" && (
          <ActionForm action={w9Step}>
            <h2 className={styles.h2}>W-9</h2>
            <p className={ui.help}>
              Your full W-9 is collected by a dedicated tax-form service, never by {BRAND}. Here, confirm your legal
              name and only the <strong>last four digits</strong> of your taxpayer number so your brokerage can match
              the form to you.
            </p>
            <input type="hidden" name="token" value={token} />
            <label className={ui.field}>
              Legal name, as on your tax return
              <input className={ui.input} name="legal_name" defaultValue={state.full_name} required maxLength={160} autoComplete="name" />
            </label>
            <label className={ui.field}>
              Last four digits only
              <input className={ui.input} name="last4" required inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" aria-describedby="last4-help" />
            </label>
            <p id="last4-help" className={ui.help}>
              Never type your full Social Security or taxpayer number here.
            </p>
            <Submit>Continue</Submit>
          </ActionForm>
        )}

        {current === "rider" && state.rider && (
          <ActionForm action={riderStep}>
            <h2 className={styles.h2}>Your commission rider</h2>
            <p className={ui.help}>This is the split your brokerage has set for you. Read it, then sign below.</p>
            <input type="hidden" name="token" value={token} />
            <div className={styles.split}>
              <span className={`brandLabel ${styles.eyebrow}`}>Your split · rider v{state.rider.version}</span>
              <span className={styles.splitValue}>{pct(state.rider.split_pct)}</span>
            </div>
            {state.rider.tiers.length > 0 && (
              <table className={ui.table}>
                <caption className="sr-only">Commission tiers</caption>
                <thead>
                  <tr>
                    <th scope="col">Commission this year</th>
                    <th scope="col" className={ui.num}>
                      Your split
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.rider.tiers.map((tier, index) => (
                    <tr key={index}>
                      <td>
                        ${tier.from.toLocaleString("en-US")}
                        {tier.to === null ? " and above" : ` to $${tier.to.toLocaleString("en-US")}`}
                      </td>
                      <td className={ui.num}>{pct(tier.pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className={ui.help}>
              Moving to a higher tier is never automatic: your brokerage approves it and you sign an updated rider.
            </p>
            <label className={ui.check}>
              <input type="checkbox" name="consent" required />
              <span>I agree to sign this rider electronically, and I understand this has the same effect as signing on paper.</span>
            </label>
            <label className={ui.field}>
              Type your full name to sign: {state.full_name}
              <input className={ui.input} name="typed_name" required maxLength={120} autoComplete="off" spellCheck={false} />
            </label>
            <Submit busy="Signing…">Sign rider</Submit>
          </ActionForm>
        )}

        {current === "rider" && !state.rider && (
          <>
            <h2 className={styles.h2}>Your commission rider</h2>
            <p className={ui.help}>Your brokerage has not sent your rider yet. They have been notified; come back with this same link.</p>
          </>
        )}

        {finished && (
          <>
            <h2 className={styles.h2}>What happens next</h2>
            <dl className={ui.kv}>
              <dt>Licence</dt>
              <dd>
                {state.licence_masked ?? "On file"} · {state.licence_status === "verified" ? "confirmed" : "waiting for your brokerage to confirm"}
                {state.licence_expires_on ? ` · expires ${day(state.licence_expires_on)}` : ""}
              </dd>
              <dt>W-9</dt>
              <dd>{state.w9_status === "received" ? "Received" : "Received · your brokerage will check the name"}</dd>
              <dt>Rider</dt>
              <dd>Signed{state.rider ? ` at ${pct(state.rider.split_pct)}` : ""}</dd>
            </dl>
            <p className={ui.help}>You can close this page. Nothing else is needed from you today.</p>
          </>
        )}
      </div>
    </Shell>
  );
}
