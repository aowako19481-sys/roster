import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../dashboard.module.css";

// Pages that exist in the design but are built in later steps. Listing them
// here keeps every sidebar link real and honest about what is not ready.
const SECTIONS: Record<string, { title: string; step: string }> = {
  agents: { title: "Agents", step: "Ops core" },
  teams: { title: "Registered teams", step: "Ops core" },
  riders: { title: "Tier clearance", step: "Ops core" },
  files: { title: "Compliance files", step: "Ops core" },
  reports: { title: "Reports and 1099s", step: "Add-ons" },
  retention: { title: "Retention insights", step: "Add-ons" },
  payouts: { title: "Payout checks", step: "Finance core" },
  "exit-kit": { title: "Exit kit", step: "Add-ons" },
  invite: { title: "Invite agents", step: "Ops core" },
  "welcome-email": { title: "Welcome email", step: "Ops core" },
  "agent-onboarding": { title: "Agent’s onboarding view", step: "Ops core" },
};

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  return { title: SECTIONS[section]?.title ?? "Not found" };
}

export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  const info = SECTIONS[section];
  if (!info) notFound();

  return (
    <div className={`${styles.soon} ${styles.r}`}>
      <p className={styles.crumb}>ROSTER / COMING LATER</p>
      <h1 className={styles.soonTitle}>{info.title}</h1>
      <p className={styles.soonText}>
        This page is designed but not built yet. It arrives with the “{info.step}” build step. Tonight’s
        build covers sign-in and the dashboard.
      </p>
      <Link href="/" className={`${styles.ghost} ${styles.soonBack} press`}>
        <span aria-hidden="true">←</span> Back to dashboard
      </Link>
    </div>
  );
}
