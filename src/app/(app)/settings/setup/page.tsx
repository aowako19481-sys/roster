import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader, ui } from "@/components/ui";
import { requireWorkspace } from "@/lib/access";
import { documensoReady } from "@/lib/documenso";
import { setupSteps } from "@/lib/setup";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Get set up" };

/** The one-time setup for a brokerage, in order, with what is done and what is next. */
export default async function SetupPage() {
  const access = await requireWorkspace();
  const supabase = await createClient();
  const steps = await setupSteps(supabase, access.workspace.id, access.workspace.hasFinance, documensoReady());
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done && !step.optional) ?? steps.find((step) => !step.done);

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Settings" title="Get set up" sub="Do these once, in order. After that Kinu runs the day-to-day by itself and only comes to you for a decision.">
        <Badge tone={done === steps.length ? "ok" : "muted"}>{done} of {steps.length} done</Badge>
      </PageHeader>
      {next ? (
        <Card title="Do this next">
          <div className={ui.inline} style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className={ui.strong}>{next.title}</p>
              <p className={ui.help}>{next.why}</p>
            </div>
            <Link className={ui.btnPrimary} href={next.href}>{next.action}</Link>
          </div>
        </Card>
      ) : (
        <Card title="You are set up"><p className={ui.help}>Everything is in place. New agents, documents, deals and payroll now follow the rules you chose.</p></Card>
      )}
      <Card title="Every step">
        <ol className={ui.list} style={{ display: "grid", gap: 14 }}>
          {steps.map((step, index) => (
            <li key={step.title} className={ui.inline} style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p className={step.done ? ui.soft : ui.strong}>
                  {step.done ? "✓" : `${index + 1}.`} {step.title} {step.optional ? <span className={ui.soft}>(optional)</span> : null}
                </p>
                <p className={ui.help}>{step.done ? step.doneNote : step.why}</p>
              </div>
              <Link className={`${ui.btn} ${ui.small}`} href={step.href}>{step.done ? "Review" : step.action}</Link>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
