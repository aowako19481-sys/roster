import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/company";
import { LEGAL_PAGES, LEGAL_UPDATED } from "@/lib/legal";
import { SiteFooter } from "../home/SiteFooter";
import "../home/site.css";

export const metadata: Metadata = {
  title: "Policies",
  description: `Every policy for ${BRAND}: terms, privacy, electronic signatures, refunds, security and more.`,
  alternates: { canonical: `${SITE_URL}/legal` },
  robots: { index: true, follow: true },
};

export default function LegalIndex() {
  return (
    <div className="ks legalpage">
      <header className="nav solid">
        <div className="wrap">
          <a className="mark" href="/" aria-label={`${BRAND} home`}>{BRAND}</a>
          <div className="acts" style={{ marginLeft: "auto" }}>
            <a className="btn dark" href="/sign-in">Sign in</a>
          </div>
        </div>
      </header>
      <main id="content" className="wrap doc">
        <p className="label">Policies</p>
        <h1>The fine print, in plain words.</h1>
        <p>Last updated {LEGAL_UPDATED}.</p>
        <ul className="list">
          {LEGAL_PAGES.map((page) => (
            <li key={page.slug}>
              <a href={`/legal/${page.slug}`}>
                <span>{page.title}</span>
                <small>{page.summary}</small>
              </a>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
