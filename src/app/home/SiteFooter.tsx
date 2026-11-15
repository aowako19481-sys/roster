import { BRAND } from "@/lib/brand";
import { COMPANY } from "@/lib/company";
import { LEGAL_PAGES } from "@/lib/legal";

/** The footer of the public site: who runs it, every policy, and the plain-words disclaimer. */
export function SiteFooter() {
  const legal = LEGAL_PAGES.filter((page) => page.group === "Legal");
  const trust = LEGAL_PAGES.filter((page) => page.group === "Trust");
  const owner = COMPANY.legalName || BRAND;
  return (
    <footer>
      <div className="wrap">
        <div className="cols">
          <div>
            <div className="mark">{BRAND}</div>
            <p style={{ marginTop: "14px", maxWidth: "22em" }}>Agent onboarding and commission payroll for real estate brokerages.</p>
            {(COMPANY.legalName || COMPANY.address || COMPANY.contactEmail) && (
              <p style={{ marginTop: "14px" }}>
                {COMPANY.legalName}
                {COMPANY.address && (
                  <>
                    <br />
                    {COMPANY.address}
                  </>
                )}
                {COMPANY.contactEmail && (
                  <>
                    <br />
                    {COMPANY.contactEmail}
                  </>
                )}
              </p>
            )}
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><a href="/#preview">See how it’s done</a></li>
              <li><a href="/#journey">The journey</a></li>
              <li><a href="/#pricing">Pricing</a></li>
              <li><a href="/#security">Security</a></li>
              <li><a href="/sign-in">Sign in</a></li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              {legal.map((page) => (
                <li key={page.slug}><a href={`/legal/${page.slug}`}>{page.title}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Trust</h4>
            <ul>
              {trust.map((page) => (
                <li key={page.slug}><a href={`/legal/${page.slug}`}>{page.title}</a></li>
              ))}
            </ul>
          </div>
        </div>
        <p className="legal">
          {BRAND} is software. It is not a law firm, accounting firm, payroll provider, bank or money transmitter, and nothing on this
          site is legal, tax or financial advice. {BRAND} calculates, flags and records; each brokerage makes its own pay decisions and
          is responsible for the documents it uploads. {BRAND} does not file tax forms. Names, addresses, figures and timings shown on
          this site are illustrations, not guarantees. © {new Date().getFullYear()} {owner}.
        </p>
      </div>
    </footer>
  );
}
