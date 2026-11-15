import Link from "next/link";
import ui from "./ui.module.css";

export { ui };

/** Title block at the top of every page. */
export function PageHeader({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={ui.pageHead}>
      <div>
        <p className={`brandLabel ${ui.eyebrow}`}>{eyebrow}</p>
        <h1 className={ui.title}>{title}</h1>
        {sub && <p className={ui.sub}>{sub}</p>}
      </div>
      {children && <div className={ui.actions}>{children}</div>}
    </header>
  );
}

export function Card({
  title,
  aside,
  children,
  className = "",
  ...rest
}: {
  title?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  return (
    <section className={`${ui.card} ${ui.pad} ${className}`} {...rest}>
      {(title || aside) && (
        <div className={ui.cardHead}>
          {title && <h2 className={ui.h2}>{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = "ok" | "bad" | "warn" | "muted" | "dark" | "plain";

/** A status word in a pill. The word carries the meaning; colour only supports it. */
export function Badge({ tone = "plain", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`${ui.badge} ${tone === "plain" ? "" : ui[tone]}`}>{children}</span>;
}

export function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className={ui.stat}>
      <span className={ui.statLabel}>{label}</span>
      <span className={ui.statValue}>{value}</span>
      {note && <span className={ui.statNote}>{note}</span>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className={ui.empty}>{children}</p>;
}

/** Marks something that needs an outside service that is not connected yet. */
export function Placeholder({ service, children }: { service: string; children: React.ReactNode }) {
  return (
    <p className={ui.placeholder}>
      <strong>Placeholder · {service}.</strong> {children}
    </p>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  return (
    <nav className={ui.tabs} aria-label="Views">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={item.href === current ? ui.tabOn : ui.tab} aria-current={item.href === current ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function ButtonLink({
  href,
  children,
  primary,
  small,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
  small?: boolean;
}) {
  return (
    <Link href={href} className={`${primary ? ui.btnPrimary : ui.btn} ${small ? ui.small : ""}`}>
      {children}
    </Link>
  );
}
