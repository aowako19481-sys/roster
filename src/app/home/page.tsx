import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/company";
import { ContactForm } from "./ContactForm";
import { SiteFooter } from "./SiteFooter";
import { SiteMotion } from "./SiteMotion";
import "./site.css";

const TITLE = `${BRAND} · Stop chasing forms. Start scaling.`;
const DESCRIPTION =
  "Kinu handles everything between “You’re hired” and “You’re paid” for real estate brokerages: agent onboarding, e-signed paperwork and checked commission payroll.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: DESCRIPTION, url: SITE_URL, siteName: BRAND, type: "website" },
};

/**
 * The public landing page. Visitors who are not signed in see it at the home
 * address (src/proxy.ts). Everything is on the page as plain HTML; SiteMotion
 * adds the movement afterwards, so the page reads fine without it.
 * Names, addresses and figures in the product pictures are made up.
 */
export default function HomePage() {
  return (
    <div className="ks" id="top">
      <header className="nav" id="nav">
        <div className="wrap">
          <a className="mark" href="#top" aria-label="Kinu home">Kinu</a>
          <nav aria-label="Main"><a href="#preview">See how it’s done</a><a href="#journey">The journey</a><a href="#pricing">Pricing</a><a href="#security">Security</a></nav>
          <div className="acts"><button type="button" className="btn ghost" data-start="">Get started</button><a className="btn dark" href="/sign-in">Sign in</a></div>
        </div>
      </header>

      <main id="content">
      <section className="hero" aria-label="Kinu: from you're hired to you're paid">
        <canvas id="silk" aria-hidden="true"></canvas>
        <div className="wrap">
          <h1><span className="hA" id="hA">You’re hired.</span>
            <span className="run" id="run">
              <svg aria-hidden="true"><path id="hThread" pathLength={1} /></svg>
              <span className="card" aria-hidden="true"><span className="label">Licence</span><b className="t">NY ••• 123</b><i></i><i></i><i></i><span className="stamp">Checked</span></span>
              <span className="card" aria-hidden="true"><span className="label">Form W‑9</span><b className="t">Tax details</b><i></i><i></i><i></i><span className="stamp">Received</span></span>
              <span className="card" aria-hidden="true"><span className="label">Rider</span><b className="t">Split 85%</b><i></i><i></i><i></i><span className="stamp">Signed</span></span>
              <span className="card" aria-hidden="true"><span className="label">Direct deposit</span><b className="t">•• 6789</b><i></i><i></i><i></i><span className="stamp">Authorised</span></span>
              <span className="card" aria-hidden="true"><span className="label">Deposit record</span><b className="t">12 Example St</b><i></i><i></i><i></i><span className="stamp">Filed</span></span>
              <span className="logo" id="logo"><span className="k">Kinu</span><span className="tg" id="tg">handles everything in between.</span></span>
            </span>
            <span className="hB" id="hB"><span>You’re paid.</span><b id="hAmt">$37,179.00</b></span>
          </h1>
          <div className="foot" id="hFoot">
            <div><p className="hook">Stop chasing forms. Start scaling.</p><p className="lede">Kinu puts your back office on autopilot. Built for founders who have better things to do than chase tax forms.</p></div>
            <div className="cta"><button type="button" className="btn light" data-start="">Get started</button><a className="btn line" href="#preview">See how it’s done</a><button type="button" className="again" id="again">Run it again ↻</button></div>
          </div>
        </div>
      </section>

      <section className="pad" id="preview">
        <div className="wrap">
          <p className="label">See how it’s done</p>
          <h2 style={{ marginTop: "16px", maxWidth: "13em" }}>Switch a tier on. Watch your Kinu grow.</h2>
          <p className="lede" style={{ marginTop: "18px" }}>This is the real layout of the product. Add a piece and see exactly what your team gets.</p>
          <div className="build">
            <div className="picks" id="picks">
              <p className="label">Products</p>
              <button type="button" className="pick" data-k="ops" aria-pressed={true}><span className="sw" /><span><b>Ops</b><small>Onboard agents, start to ready</small></span></button>
              <button type="button" className="pick" data-k="fin" aria-pressed={false}><span className="sw" /><span><b>Finance</b><small>Commission payroll, checked</small></span></button>
              <p className="label">Add‑ons</p>
              <button type="button" className="pick" data-k="ret" aria-pressed={false}><span className="sw" /><span><b>Retention Insights + Exit Kit</b><small>See who may leave, and handle exits cleanly</small></span></button>
              <button type="button" className="pick" data-k="shi" aria-pressed={false}><span className="sw" /><span><b>Finance Shield</b><small>Payout checks and override controls</small></span></button>
              <button type="button" className="pick" data-k="com" aria-pressed={false}><span className="sw" /><span><b>Compliance pack</b><small>Audit files and year‑end exports</small></span></button>
              <div className="total glass" aria-live="polite"><p className="label">In your Kinu</p><div><span className="n" id="bTotal">1 of 5</span></div><p className="save" id="bSave">Add Finance to run payroll from the same record.</p><button type="button" className="btn dark" data-start="" style={{ marginTop: "6px" }}>Get started with this</button></div>
            </div>
            <div className="win" aria-live="polite">
              <div className="rail" id="rail" aria-hidden="true"></div>
              <div className="screen" id="screen"></div>
            </div>
          </div>
        </div>
      </section>

      <section className="night pad">
        <div className="wrap"><p className="say" id="say">No 14‑day setup calls. Just log in and run. Everything between “You’re hired” and “You’re paid”, handled automatically.</p></div>
      </section>

      <section className="night pad" id="journey" style={{ paddingTop: "0" }}>
        <div className="wrap">
          <p className="label">The journey</p>
          <h2 style={{ marginTop: "14px" }}>One agent. Six moments.</h2>
          <p className="lede" style={{ marginTop: "16px" }}>On the left, what the agent sees on their phone. On the right, what your team sees at the same second.</p>
          <div className="moments" id="moments">
            <div className="phone" aria-hidden="true"><div className="scr" id="mPhone"></div></div>
            <svg className="wire" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 20 C30 2, 70 38, 100 20"/><path className="pulse" id="mPulse" pathLength={1} d="M0 20 C30 2, 70 38, 100 20"/></svg>
            <div className="deskwin" aria-hidden="true"><p className="label">Your screen · Your brokerage</p><div id="mDesk"></div></div>
          </div>
          <p className="sr" id="mLive" aria-live="polite"></p>
          <div className="steps" id="steps" role="tablist" aria-label="Moments">
            <button role="tab" type="button"><i></i><small>Day 0</small><b>Invited</b></button><button role="tab" type="button"><i></i><small>Minute 4</small><b>Licence</b></button><button role="tab" type="button"><i></i><small>Minute 7</small><b>W‑9</b></button><button role="tab" type="button"><i></i><small>Minute 10</small><b>Signed</b></button><button role="tab" type="button"><i></i><small>First deal</small><b>Checked</b></button><button role="tab" type="button"><i></i><small>Payroll day</small><b>Paid</b></button>
          </div>
        </div>
      </section>

      <section className="hours pad" id="hours">
        <div className="wrap">
          <p className="label">Your number, not ours</p>
          <h2 style={{ marginTop: "16px", maxWidth: "12em" }}>What would you do with the time?</h2>
          <div className="grid">
            <form>
              <label htmlFor="c-agents">Agents you bring on each month <output id="o-agents">8</output><input id="c-agents" type="range" min="1" max="60" defaultValue="8" /></label>
              <label htmlFor="c-mins">Minutes of follow‑up each one takes today <output id="o-mins">90</output><input id="c-mins" type="range" min="15" max="240" step="15" defaultValue="90" /></label>
              <label htmlFor="c-deals">Deals you pay out each month <output id="o-deals">120</output><input id="c-deals" type="range" min="10" max="800" step="10" defaultValue="120" /></label>
            </form>
            <div className="res"><div className="big" id="c-hours">0</div><p><b>hours a year</b> handed back to your team. About <b id="c-weeks">0</b> working weeks, from your own numbers and six minutes of checking per deal. Spend them on recruiting. Or on lunch.</p></div>
          </div>
        </div>
      </section>

      <section className="pad" style={{ paddingTop: "0" }}>
        <div className="wrap coffee">
          <div><p className="label">A fair race</p><h2 style={{ marginTop: "16px" }}>What if onboarding a new agent took less time than making their welcome coffee?</h2><p className="lede" style={{ marginTop: "22px" }}>The agent’s side is one link on their phone. Details, licence, W‑9, signatures. Then they get on with selling.</p><p className="fine" style={{ marginTop: "16px" }}>A slow coffee, admittedly. Ten minutes is our design target for the agent’s own steps, not a guarantee.</p></div>
          <div className="ring" id="ring" role="img" aria-label="A timer filling to ten minutes"><svg viewBox="0 0 36 36"><circle className="t" cx="18" cy="18" r="15.9155"/><circle className="c" cx="18" cy="18" r="15.9155" pathLength={100}/></svg><div><b id="ringN">10:00</b><span>Hired to ready</span></div></div>
        </div>
      </section>

      <section className="night pad" id="pricing">
        <div className="wrap">
          <p className="label">One price per agent seat</p>
          <div className="offer" style={{ marginTop: "20px" }}>
            <div>
              <div className="term" role="group" aria-label="How you pay">
                <button type="button" id="termM" aria-pressed={false}>Month to month</button>
                <button type="button" id="termA" aria-pressed={true}>12‑month plan</button>
              </div>
              <div className="now" id="pNow">$12.50</div>
              <p className="lede" style={{ marginTop: "14px", color: "#fff" }}>per agent seat, per month. Every product. Every add‑on. Every office.</p>
              <span className="tag" id="pSave">Two months’ worth saved every year</span>
            </div>
            <div>
              <label htmlFor="p-agents" className="label">Agent seats: <output id="pN">500</output></label><input id="p-agents" type="range" min="20" max="1500" step="10" defaultValue="500" style={{ accentColor: "#fff" }} />
              <ul style={{ marginTop: "22px" }}>
                <li className="sum"><span id="pLine">500 seats on the 12‑month plan</span><b id="pTotal">$6,250 a month</b></li>
                <li><span>The same seats, month to month</span><b id="pOther">$7,500 a month</b></li>
                <li><span>Ops and Finance</span><b>Included</b></li>
                <li><span>Retention Insights + Exit Kit, Finance Shield, Compliance pack</span><b>Included</b></li>
                <li><span>Offices, teams and staff logins</span><b>No extra charge</b></li>
                <li><span>Owner / Admin seats</span><b>1 included</b></li>
              </ul>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}><button type="button" className="btn light" data-start="">Get started</button><a className="btn line" href="#preview">See how it’s done</a></div>
            </div>
          </div>
          <div className="quote">
            <div><p className="label">Large or multi‑branch brokerages</p><p style={{ marginTop: "8px", color: "#fff", fontSize: "1.2rem" }}>Over 500 agents, many branches, or a compliance hierarchy to mirror? You get a custom quote.</p></div>
            <button type="button" className="btn line" data-start="">Contact {BRAND}</button>
          </div>
          <p className="fine" style={{ marginTop: "26px", maxWidth: "62em" }}>Both plans are billed monthly; nothing is charged for the year upfront. The 12‑month plan is a commitment: if it is cancelled before 12 months, the months used are re‑billed at the month‑to‑month price. $500 monthly minimum. One‑time setup from $1,500. Extra Owner / Admin seats are available on request. Plans renew until cancelled (see Refunds and Cancellation). Prices exclude tax.</p>
        </div>
      </section>

      <section className="pad" id="security">
        <div className="wrap">
          <p className="label">Security, in plain words</p>
          <h2 style={{ marginTop: "16px" }}>We keep less. On purpose.</h2>
          <div className="trust">
            <div><h3>No full tax or bank numbers</h3><p>Kinu stores the last four digits only. Full numbers live with the specialist provider or your bank.</p></div>
            <div><h3>Each brokerage sealed off</h3><p>The database itself refuses to show one brokerage’s records to another.</p></div>
            <div><h3>Every change has a name</h3><p>Overrides, approvals and releases go into a log nobody can edit.</p></div>
            <div><h3>Signatures with a record</h3><p>Consent, time, device and a fingerprint of the exact document, kept by both sides.</p></div>
            <div><h3>No ad trackers</h3><p>No analytics pixels, no session recording, no fonts loaded from other companies.</p></div>
            <div><h3>You decide who can pay</h3><p>Releasing payroll and overriding a split are separate powers you give to named people.</p></div>
          </div>
          <h2 style={{ margin: "80px 0 24px", fontSize: "var(--s-2)" }}>Before you ask.</h2>
          <details><summary>Does Kinu replace our transaction platform?</summary><p>No. Keep it. Kinu is the internal side: onboarding and commission payroll.</p></details>
          <details><summary>Does Kinu decide what an agent is paid?</summary><p>No. Kinu calculates, checks and records. Your brokerage approves and makes every pay decision.</p></details>
          <details><summary>Does Kinu file 1099s or give tax advice?</summary><p>No. Kinu prepares exports for your accountant or e‑file service. It is not a tax, legal or accounting adviser.</p></details>
          <details><summary>Are the electronic signatures valid?</summary><p>They are built around the US ESIGN Act and UETA: consent, intent, a record tied to the signer, and a copy for both sides. Some documents have extra rules in some states; ask your attorney.</p></details>
        </div>
      </section>

      <section className="night end pad">
        <div className="wrap">
          <p className="label">The thread starts here</p>
          <h2 style={{ marginTop: "16px" }}>You have better things to do.</h2>
          <p className="lede" style={{ marginTop: "22px" }}>Be among the first brokerages automating everything between “You’re hired” and “You’re paid.”</p>
          <div className="cta"><button type="button" className="btn light" data-start="">Get started</button><a className="btn line" href="#preview">See how it’s done</a></div>
        </div>
      </section>
      </main>

      <SiteFooter />

      <dialog id="start" aria-labelledby="startH">
        <div className="dlg">
          <button type="button" className="x" id="startX">
            Close ✕
          </button>
          <p className="label">Get started</p>
          <h2 id="startH">Talk to the {BRAND} team.</h2>
          <p style={{ color: "var(--mute)" }}>Tell us about your brokerage. A person replies, usually within one working day.</p>
          <ContactForm />
        </div>
      </dialog>
      <SiteMotion />
    </div>
  );
}
