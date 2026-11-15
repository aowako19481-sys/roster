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
      <canvas id="silk" aria-hidden="true"></canvas>
      <header className="nav" id="nav">
        <div className="wrap">
          <a className="mark" href="#top" aria-label="Kinu home">Kinu</a>
          <nav aria-label="Main"><a href="#preview">See how it’s done</a><a href="#retention">Retention</a><a href="#journey">The journey</a><a href="#pricing">Pricing</a><a href="#security">Security</a></nav>
          <div className="acts"><button type="button" className="btn ghost" data-start="">Get started</button><a className="btn dark" href="/sign-in">Sign in</a></div>
        </div>
      </header>

      <main id="content">
      <section className="hero" aria-label="Kinu: from you're hired to you're paid">
        <div className="wrap">
          <h1><span className="hA" id="hA">You’re hired.</span>
            <span className="run" id="run">
              <svg aria-hidden="true"><path id="hThread" pathLength={1} /></svg>
              <span className="chip" aria-hidden="true"><i className="ic"></i><b>Licence</b><em></em></span>
              <span className="chip" aria-hidden="true"><i className="ic"></i><b>W‑9</b><em></em></span>
              <span className="chip" aria-hidden="true"><i className="ic"></i><b>Rider</b><em></em></span>
              <span className="chip" aria-hidden="true"><i className="ic"></i><b>Direct deposit</b><em></em></span>
              <span className="chip" aria-hidden="true"><i className="ic"></i><b>Deposit record</b><em></em></span>
              <span className="logo" id="logo"><span className="k">Kinu</span><span className="tg" id="tg">handles everything in between.</span></span>
            </span>
            <span className="hB" id="hB"><span>You’re paid.</span><b id="hAmt">$37,179.00</b></span>
          </h1>
          <div className="foot" id="hFoot">
            <div><p className="hook">Stop chasing forms. Start scaling.</p><p className="lede">Kinu puts your back office on autopilot. Built for founders who have better things to do than chase tax forms.</p></div>
            <div className="cta"><button type="button" className="btn dark" id="tourBtn"><span aria-hidden="true">▶</span> Begin walkthrough</button><button type="button" className="btn" data-start="">Get started</button><button type="button" className="again" id="again">Run it again ↻</button></div>
          </div>
        </div>
      </section>

      <section className="pad" id="preview">
        <div className="wrap">
          <p className="label">See how it’s done</p>
          <h2 style={{ marginTop: "16px", maxWidth: "13em" }}>One screen that knows who is ready and what is owed.</h2>
          <p className="lede" style={{ marginTop: "18px" }}>This is the product as it looks today. Switch between the views your team gets.</p>
          <div className="tabs" role="tablist" aria-label="Views"><button type="button" role="tab" aria-selected={true} data-v="adv">Advanced view</button><button type="button" role="tab" aria-selected={false} data-v="std">Standard view</button><button type="button" role="tab" aria-selected={false} data-v="ret">Retention Insights</button><button type="button" role="tab" aria-selected={false} data-v="id">Agent ID card</button></div>
          <div className="app glass tick">
            <div className="rail" aria-hidden="true"><span className="mark">Kinu</span><span className="cur">Home</span><span>Agents</span><span>Teams</span><span>Riders</span><span>Paperwork</span><span>Deals</span><span>Payments</span><span>Payroll</span><span>Documents</span><span>Settings</span></div>
            <div className="screen" id="screen"></div>
          </div>
          <p className="fine" style={{ marginTop: "14px" }}>Names and figures in these pictures are made up.</p>
        </div>
      </section>

      <section className="pad" id="retention" style={{ paddingTop: "0" }}>
        <div className="wrap reten">
          <div>
            <p className="label">Retention Insights + Exit Kit</p>
            <h2 style={{ marginTop: "16px" }}>Keep the agents you worked to win.</h2>
            <p className="lede" style={{ marginTop: "18px" }}>Often the first sign an agent is drifting is in their numbers. Kinu reads your own deal and payroll records and tells you who to check in with, while the conversation can still change something.</p>
            <ul>
              <li><b>An early signal</b>Each agent is scored from your own data: High risk, Watch or Healthy, with the reasons shown.</li>
              <li><b>A way to start the conversation</b>A suggested opener for every flagged agent, written without the numbers so it feels like a check‑in.</li>
              <li><b>A clean exit when it does happen</b>The Exit Kit lists open deals to reassign and the final payout, so nothing is missed.</li>
            </ul>
            <a className="btn dark" href="#pricing">Add it to your plan</a>
            <p className="fine" style={{ marginTop: "16px" }}>A signal is a prompt to talk, not a prediction. Your brokerage decides what to do with it.</p>
          </div>
          <div className="deal" data-reten="" aria-hidden="true"></div>
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

      <section className="pad" id="pricing" style={{ paddingTop: "0" }}>
        <div className="wrap">
          <p className="label">Pricing</p>
          <h2 style={{ marginTop: "14px", maxWidth: "12em" }}>Build your plan. See the number.</h2>
          <div className="price">
            <div className="build glass tick">
              <div className="term" role="group" aria-label="How you pay"><button type="button" id="tM" aria-pressed={true}>Month to month</button><button type="button" id="tA" aria-pressed={false}>12‑month plan</button></div>
              <div className="field">
                <div className="top"><label htmlFor="seats" className="label">Agent seats</label><output id="oSeats" htmlFor="seats">250</output></div>
                <input id="seats" type="range" min="10" max="1510" step="10" defaultValue="250" />
                <div className="top mono"><span>10</span><span>1,500 · over that, a custom quote</span></div>
              </div>
              <div className="field">
                <p className="label">Included in every seat</p>
                <div className="adds"><div className="add inc"><span className="sw" aria-hidden="true"></span><span><b>Ops and Finance</b><small>Onboarding, paperwork, e‑signatures, deals, payroll, documents</small></span><span className="p">Included</span></div></div>
              </div>
              <div className="field">
                <p className="label">Add‑ons, per agent seat</p>
                <div className="adds" id="adds">
                  <button type="button" className="add" data-k="ret" aria-pressed={false}><span className="sw" aria-hidden="true"></span><span><b>Retention Insights + Exit Kit</b><small>See who may leave; handle exits cleanly</small></span><span className="p">+ $4.00</span></button>
                  <button type="button" className="add" data-k="shi" aria-pressed={false}><span className="sw" aria-hidden="true"></span><span><b>Finance Shield</b><small>Payout checks and override controls</small></span><span className="p">+ $1.50</span></button>
                  <button type="button" className="add" data-k="com" aria-pressed={false}><span className="sw" aria-hidden="true"></span><span><b>Compliance pack</b><small>Audit files and year‑end exports</small></span><span className="p">+ $1.50</span></button>
                </div>
              </div>
              <div className="field">
                <div className="top"><span><span className="label">Extra admin seats</span><br /><small style={{ color: "var(--mute)" }}>1 admin seat is included. Each extra one is $49.50 a month.</small></span>
                  <span className="step"><button type="button" id="aMinus" aria-label="One fewer extra admin seat">−</button><output id="oAdmins" aria-live="polite">0</output><button type="button" id="aPlus" aria-label="One more extra admin seat">+</button></span></div>
              </div>
            </div>
            <aside className="total" aria-live="polite">
              <p className="label" id="tLabel">Month to month</p>
              <div><div className="tbig" id="tBig">$3,997.50</div><p className="per" id="tPer">a month · $15.99 per agent seat</p></div>
              <ul id="tLines"></ul>
              <button type="button" className="btn" data-start="" id="tCta">Get started with this plan</button>
              <p className="fine" id="tFine"></p>
            </aside>
          </div>
          <p className="fine" style={{ marginTop: "18px", maxWidth: "62em" }}>Both plans are billed monthly; nothing is charged for the year upfront. The 12‑month plan is a commitment: if it is cancelled before 12 months, the months used are re‑billed at the month‑to‑month price. $500 monthly minimum. The one‑time setup fee depends on your volume and is quoted with your plan. One Owner / Admin seat is included; each extra one is $49.50 a month, added to your monthly bill. Over 1,500 agents gets a custom quote. Plans renew until cancelled (see Refunds and Cancellation). Prices exclude tax.</p>
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
          <div className="cta"><button type="button" className="btn light" data-start="">Get started</button><a className="btn line" href="#pricing">Build your plan</a></div>
        </div>
      </section>
      </main>

      <SiteFooter />

      <div className="tour" id="tour" role="dialog" aria-modal="true" aria-label="Kinu walkthrough" hidden></div>

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
