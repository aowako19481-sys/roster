import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/ActionForm";
import { ui } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { day, pct } from "@/lib/format";
import { ACK_TEXT, consentText } from "@/lib/esign";
import { loadPacket, loadPortal, loadSignatures, type PacketItem, type PortalState } from "@/lib/portal";
import { detailsStep, licenceStep, packetStep, riderStep, w9Step } from "./actions";
import styles from "./portal.module.css";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }> };
type StepKey = "details" | "licence" | "w9" | "rider" | "packet";

function stepsOf(state: PortalState, packet: PacketItem[]): { key: StepKey; label: string; done: boolean }[] {
  const required = packet.filter((item) => item.required);
  const paperwork = packet.length
    ? [{ key: "packet" as const, label: `Your paperwork (${required.filter((item) => item.done).length} of ${required.length})`, done: required.every((item) => item.done) }]
    : [];
  return [
    { key: "details", label: "Your details", done: state.details_done },
    { key: "licence", label: "Licence", done: state.licence_status !== "not_uploaded" },
    { key: "w9", label: "W-9", done: state.w9_status !== "pending" },
    { key: "rider", label: "Sign your rider", done: state.rider_status === "signed" },
    ...paperwork,
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
  const [packet, signatures] = await Promise.all([loadPacket(token), loadSignatures(token)]);
  const disclosure = consentText(lookup.state.brokerage);
  const copyOf = (subjectId: string) => [...signatures].reverse().find((entry) => entry.subject_id === subjectId);
  const riderCopy = [...signatures].reverse().find((entry) => entry.subject === "rider");
  const steps = stepsOf(state, packet);
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
            : "A few short steps and you are ready to go. You can stop and come back with the same link."}
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
              <span>I agree to sign this rider electronically.</span>
            </label>
            <p className={ui.help}>{disclosure}</p>
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

        {(current === "packet" || (finished && packet.length > 0)) && (
          <>
            <h2 className={styles.h2}>Your paperwork</h2>
            <p className={ui.help}>
              {current === "packet"
                ? "The documents your brokerage needs from you. Do them in any order."
                : "All required paperwork is complete."}
            </p>
            <ul className={styles.items}>
              {packet.map((item) => (
                <li key={item.id} className={styles.item}>
                  <div className={styles.itemHead}>
                    <h3 className={styles.h3}>{item.title}</h3>
                    <span className={`${ui.badge} ${item.done ? ui.ok : item.required ? "" : ui.muted}`}>
                      {item.done ? "Done" : item.required ? "To do" : "Optional"}
                    </span>
                  </div>
                  {item.body && <p className={ui.help}>{item.body}</p>}
                  {item.has_file && (
                    <a className={styles.docLink} href={`/welcome/${token}/doc/${item.id}`} target="_blank" rel="noopener noreferrer">
                      Open the document<span className="sr-only"> for {item.title} (opens in a new tab)</span>
                    </a>
                  )}
                  {item.done && copyOf(item.id) && (
                    <a className={styles.docLink} href={`/welcome/${token}/signed/${copyOf(item.id)?.id}`}>
                      Download your copy<span className="sr-only"> of {item.title} (PDF)</span>
                    </a>
                  )}
                  {!item.done && (
                    <ActionForm action={packetStep}>
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="item" value={item.id} />
                      {item.kind === "sign" && (
                        <>
                          <label className={ui.check}>
                            <input type="checkbox" name="agreed" required />
                            <span>I have read this document and agree to sign it electronically.</span>
                          </label>
                          <p className={ui.help}>{disclosure}</p>
                          <label className={ui.field}>
                            Type your full name to sign: {state.full_name}
                            <input className={ui.input} name="typed_name" required maxLength={120} autoComplete="off" spellCheck={false} />
                          </label>
                          <Submit small busy="Signing…">
                            Sign
                          </Submit>
                        </>
                      )}
                      {item.kind === "acknowledge" && (
                        <>
                          <label className={ui.check}>
                            <input type="checkbox" name="agreed" required />
                            <span>{ACK_TEXT.replace(/^[^.]*\.\s*/, "")}</span>
                          </label>
                          <Submit small>Confirm</Submit>
                        </>
                      )}
                      {item.kind === "upload" && (
                        <>
                          <label className={ui.field}>
                            File (JPEG, PNG, WebP or PDF, up to 10 MB)
                            <input className={styles.file} name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" />
                          </label>
                          <Submit small busy="Uploading…">
                            Upload
                          </Submit>
                        </>
                      )}
                      {item.kind === "bank" && (
                        <>
                          <p className={ui.help}>
                            Only the bank&apos;s name and the last four digits are kept here, so your payments can be matched to you.
                            Never type your full account or routing number on this page. Your brokerage will take the full
                            details through its bank or payroll provider.
                          </p>
                          <label className={ui.field}>
                            Bank name
                            <input className={ui.input} name="bank_name" required minLength={2} maxLength={80} autoComplete="off" />
                          </label>
                          <label className={ui.field}>
                            Account type
                            <select className={ui.select} name="bank_type" defaultValue="checking">
                              <option value="checking">Checking</option>
                              <option value="savings">Savings</option>
                            </select>
                          </label>
                          <label className={ui.field}>
                            Last four digits of the account number
                            <input className={ui.input} name="bank_last4" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" />
                          </label>
                          <label className={ui.check}>
                            <input type="checkbox" name="agreed" required />
                            <span>I authorise this and agree to sign it electronically.</span>
                          </label>
                          <p className={ui.help}>{disclosure}</p>
                          <label className={ui.field}>
                            Type your full name to sign: {state.full_name}
                            <input className={ui.input} name="typed_name" required maxLength={120} autoComplete="off" spellCheck={false} />
                          </label>
                          <Submit small busy="Signing…">
                            Sign authorisation
                          </Submit>
                        </>
                      )}
                      {item.kind === "outside" && (
                        <Submit small variant="plain">
                          I have done this
                        </Submit>
                      )}
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
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
              <dd>
                Signed{state.rider ? ` at ${pct(state.rider.split_pct)}` : ""}
                {riderCopy && (
                  <>
                    {" · "}
                    <a className={styles.docLink} href={`/welcome/${token}/signed/${riderCopy.id}`}>
                      Download your signed copy<span className="sr-only"> of the rider (PDF)</span>
                    </a>
                  </>
                )}
              </dd>
            </dl>
            <p className={ui.help}>You can close this page. Nothing else is needed from you today.</p>
          </>
        )}
      </div>
    </Shell>
  );
}
