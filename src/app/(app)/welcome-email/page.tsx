import type { Metadata } from "next";
import { ButtonLink, Card, PageHeader, Placeholder, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { day, todayIso } from "@/lib/format";
import { addDays } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";
import styles from "./email.module.css";

export const metadata: Metadata = { title: "Welcome email" };

const STEPS = [
  { label: "Confirm your details", time: "2 min" },
  { label: "Add your licence", time: "2 min" },
  { label: "Complete your W-9", time: "5 min" },
  { label: "Review and sign your rider", time: "5 min" },
];

export default async function WelcomeEmailPage() {
  const access = await requireCap("agents.invite");
  const brokerage = access.workspace.name;
  const supabase = await createClient();
  const { data: settings } = await supabase.from("workspaces").select("reply_alias").eq("id", access.workspace.id).maybeSingle();
  const replyTo = (settings?.reply_alias as string | null) || "your onboarding contact (set a reply address in Settings)";
  const expires = day(addDays(todayIso(access.workspace.timezone), 14));

  const reminders = [
    { when: "Straight away", subject: `Welcome to ${brokerage}. Let’s get you ready.`, note: "The email shown here." },
    { when: "After 24 hours", subject: `A quick reminder from ${brokerage}`, note: "Sent only if onboarding is not finished." },
    { when: "After 72 hours", subject: `Your ${brokerage} onboarding link is still open`, note: "The last reminder. After this, ops follows up by hand." },
  ];

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Onboarding" title="Welcome email" sub="This is what a new agent will see in their inbox.">
        <ButtonLink href="/invite">Back to Invite agents</ButtonLink>
      </PageHeader>

      <Placeholder service="Email (Resend)">
        This is a preview only. No email is sent yet: once the email service is connected, this message goes out
        automatically when you invite an agent, from your brokerage’s name. Until then, copy each agent’s link from the
        Invite page and send it by hand.
      </Placeholder>

      <div className={ui.split}>
        <Card title="Preview">
          <dl className={ui.kv}>
            <dt>From</dt>
            <dd>{brokerage} · Onboarding</dd>
            <dt>Reply-to</dt>
            <dd>{replyTo}</dd>
            <dt>To</dt>
            <dd>Priya Nair (example agent)</dd>
            <dt>Subject</dt>
            <dd className={ui.strong}>Welcome to {brokerage}. Let’s get you ready.</dd>
          </dl>

          <article className={styles.letter} aria-label="Email body">
            <p className={`brandLabel ${styles.sender}`}>{brokerage}</p>
            <h3 className={styles.heading}>Welcome aboard, Priya.</h3>
            <p>
              We are glad you are joining {brokerage}. Before your first deal we need a few things from you. It takes about
              15 minutes, and your progress is saved as you go.
            </p>
            <p>
              <span className={styles.button}>Start onboarding</span>{" "}
              <span className={ui.soft}>The one button. It opens the agent’s private link.</span>
            </p>
            <table className={styles.details}>
              <caption>Your details</caption>
              <tbody>
                <tr>
                  <th scope="row">Name</th>
                  <td>Priya Nair</td>
                </tr>
                <tr>
                  <th scope="row">Office</th>
                  <td>Your office at {brokerage}</td>
                </tr>
                <tr>
                  <th scope="row">Starting split</th>
                  <td>70% (shown in full on your rider)</td>
                </tr>
                <tr>
                  <th scope="row">Link works until</th>
                  <td>{expires}</td>
                </tr>
                {STEPS.map((step, index) => (
                  <tr key={step.label}>
                    <th scope="row">Step {index + 1}</th>
                    <td>
                      {step.label} · about {step.time}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              This link is only for you and works for 14 days. We will never ask for a password or bank details by email.
              Questions? Just reply to this email and your onboarding contact will get back to you.
            </p>
            <footer className={styles.footer}>
              <p>
                {brokerage} · [Postal address of the brokerage goes here]
              </p>
              <p>You are receiving this because {brokerage} invited you to join as an agent.</p>
            </footer>
          </article>
        </Card>

        <div className={ui.stack}>
          <Card title="Reminders">
            <ul className={ui.list}>
              {reminders.map((reminder) => (
                <li key={reminder.when}>
                  <span className={ui.strong}>{reminder.when}</span>
                  <br />
                  {reminder.subject}
                  <br />
                  <span className={ui.soft}>{reminder.note}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Before this goes live">
            <ul className={ui.list}>
              <li>
                <span className={ui.strong}>Postal address</span>
                <br />
                <span className={ui.soft}>Commercial email rules require a real postal address in the footer. It is a placeholder for now.</span>
              </li>
              <li>
                <span className={ui.strong}>Reply-to</span>
                <br />
                <span className={ui.soft}>Replies go to a real person at the brokerage, never a no-reply address.</span>
              </li>
              <li>
                <span className={ui.strong}>Logo</span>
                <br />
                <span className={ui.soft}>The brokerage’s logo sits above the name once one is uploaded.</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
