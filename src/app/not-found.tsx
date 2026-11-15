import Link from "next/link";

export default function NotFound() {
  return (
    <main id="content" style={{ maxWidth: 460, margin: "16vh auto 0", padding: "0 24px" }}>
      <p style={{ fontSize: 11, letterSpacing: "0.24em", color: "var(--mute)" }}>404</p>
      <h1 style={{ fontWeight: 200, fontSize: 52, letterSpacing: "-0.03em", lineHeight: 1, margin: "12px 0" }}>Page not found</h1>
      <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-soft)" }}>
        That address does not exist. <Link href="/">Back to the dashboard</Link>
      </p>
    </main>
  );
}
