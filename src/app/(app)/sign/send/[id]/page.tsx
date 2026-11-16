import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { FilePreview } from "@/components/FilePreview";
import { Card, PageHeader, ui } from "@/components/ui";
import { requireWorkspace } from "@/lib/access";
import { documensoReady } from "@/lib/documenso";
import { createClient } from "@/lib/supabase/server";
import { sendDocument } from "../../actions";
import styles from "../../sign.module.css";

export const metadata: Metadata = { title: "Send for signature" };

export default async function SendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireWorkspace();
  if (!access.caps.has("files.manage") && !access.caps.has("riders.manage")) notFound();
  const ws = access.workspace.id;
  const supabase = await createClient();
  const [{ data: template }, { data: agents }] = await Promise.all([
    supabase.from("sign_templates").select("id, name, roles, fields, page_count").eq("id", id).eq("workspace_id", ws).eq("active", true).maybeSingle(),
    supabase.from("agents").select("id, full_name, email").eq("workspace_id", ws).order("full_name").limit(2000),
  ]);
  if (!template) notFound();
  const roles = (template.roles as string[]) ?? [];
  const people = ((agents ?? []) as { id: string; full_name: string; email: string | null }[]).filter((agent) => agent.email);
  const me = access.displayName ?? "";

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Send for signature" title={template.name as string} sub="Choose who signs. Each person gets their own email from KINU.">
        <Link className={ui.btn} href="/sign">Back to documents</Link>
      </PageHeader>
      {!documensoReady() ? <p className={ui.error} role="alert">Electronic signing is not switched on yet.</p> : null}
      <Card title="Who signs">
        <div className={styles.thumbRow}>
          <FilePreview src={`/sign/templates/${template.id}/file`} name={`${template.name}.pdf`} width={120} />
          <ActionForm action={sendDocument} className={ui.stack}>
            <input type="hidden" name="template" value={template.id as string} />
            <label className={ui.field}>
              Title the signer sees
              <input className={ui.input} name="title" defaultValue={template.name as string} required minLength={2} maxLength={200} />
            </label>
            {roles.map((role, index) => (
              <fieldset key={index} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className={ui.strong} style={{ marginBottom: 8 }}>{role}</legend>
                <div className={styles.signerGrid}>
                  <label className={ui.field}>
                    An agent
                    <select className={ui.input} name={`agent_${index}`} defaultValue="">
                      <option value="">Not an agent: type them in →</option>
                      {people.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
                    </select>
                  </label>
                  <label className={ui.field}>
                    Or their name
                    <input className={ui.input} name={`name_${index}`} maxLength={160} defaultValue={index > 0 && /broker|company|manager|office/i.test(role) ? me : ""} autoComplete="off" />
                  </label>
                  <label className={ui.field}>
                    and email
                    <input className={ui.input} type="email" name={`email_${index}`} maxLength={254} autoComplete="off" />
                  </label>
                </div>
              </fieldset>
            ))}
            <Submit busy="Sending…">Send for signature</Submit>
            <p className={ui.help}>When everyone has signed, the sealed copy and its signing certificate are filed in each chosen agent’s file automatically.</p>
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
