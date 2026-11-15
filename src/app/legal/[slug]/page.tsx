import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/company";
import { LEGAL_PAGES, LEGAL_UPDATED, legalPage } from "@/lib/legal";
import { SiteFooter } from "../../home/SiteFooter";
import "../../home/site.css";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = legalPage(slug);
  if (!page) return { title: "Not found" };
  return { title: page.title, description: page.summary, alternates: { canonical: `${SITE_URL}/legal/${page.slug}` }, robots: { index: true, follow: true } };
}

export default async function LegalPage({ params }: Props) {
  const { slug } = await params;
  const page = legalPage(slug);
  if (!page) notFound();
  return (
    <div className="ks legalpage">
      <header className="nav solid">
        <div className="wrap">
          <a className="mark" href="/" aria-label={`${BRAND} home`}>{BRAND}</a>
          <nav aria-label="Policies" style={{ display: "flex" }}>
            <a href="/legal">All policies</a>
          </nav>
          <div className="acts">
            <a className="btn dark" href="/sign-in">Sign in</a>
          </div>
        </div>
      </header>
      <main id="content" className="wrap doc">
        <p className="label">{page.group}</p>
        <h1>{page.title}</h1>
        <p>Last updated {LEGAL_UPDATED}.</p>
        {page.intro.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.map((block) =>
              Array.isArray(block) ? (
                <ul key={block.join("|").slice(0, 80)}>
                  {block.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={block}>{block}</p>
              ),
            )}
          </section>
        ))}
        <p style={{ marginTop: "40px" }}>
          Other policies:{" "}
          {LEGAL_PAGES.filter((other) => other.slug !== page.slug).map((other, index) => (
            <span key={other.slug}>
              {index > 0 && " · "}
              <a href={`/legal/${other.slug}`}>{other.title}</a>
            </span>
          ))}
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
