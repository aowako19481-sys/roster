import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { AutoCheck } from "@/components/AutoCheck";
import { DropZone } from "@/components/DropZone";
import { FilePreview } from "@/components/FilePreview";
import { Badge, Card, Empty, PageHeader, ui } from "@/components/ui";
import { requireWorkspace } from "@/lib/access";
import { documensoReady } from "@/lib/documenso";
import { dayTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cancelDocument, checkDocuments, createTemplate, remindDocument, removeTemplate, setTemplatePack } from "./actions";
import styles from "./sign.module.css";

export const metadata: Metadata = { title: "Documents to sign" };

type Template = { id: string; name: string; page_count: number; roles: string[]; fields: { type: string }[]; updated_at: string; pack: string; default_signers: { name?: string; email?: string }[] };
type Sent = { id: string; title: string; status: string; signers: { name: string; role: string; status: string }[]; sent_at: string; completed_at: string | null; file_path: string | null };
const LABEL: Record<string, string> = { sent: "Sent", opened: "Opened", signed: "Signed", declined: "Declined", cancelled: "Cancelled" };

export default async function SignPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const access = await requireWorkspace();
  const ws = access.workspace.id;
  const tz = access.workspace.timezone;
  const canManage = access.caps.has("files.manage") || access.caps.has("riders.manage");
  const signingOn = documensoReady();
  const supabase = await createClient();
  const [templateRes, sentRes] = await Promise.all([
    supabase.from("sign_templates").select("id, name, page_count, roles, fields, updated_at, pack, default_signers").eq("workspace_id", ws).eq("active", true).order("name").limit(200),
    supabase.from("sign_documents").select("id, title, status, signers, sent_at, completed_at, file_path").eq("workspace_id", ws).order("sent_at", { ascending: false }).limit(200),
  ]);
  const templates = (templateRes.data ?? []) as Template[];
  const sent = (sentRes.data ?? []) as Sent[];
  const waiting = sent.filter((doc) => doc.status === "sent" || doc.status === "opened");
  const justSent = (await searchParams).sent === "1";

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Documents to sign" title="Send it once. It comes back signed." sub="Upload a PDF, let Kinu place the signing boxes, check them, and send. The signed copy files itself.">
        {signingOn ? <Badge tone="muted">Signing is on</Badge> : <Badge tone="muted">Signing not switched on</Badge>}
      </PageHeader>
      {canManage && signingOn ? <AutoCheck action={checkDocuments} waiting={waiting.length} /> : null}
      {justSent ? <p className={ui.success} role="status">Sent. Each signer has an email from KINU with their link.</p> : null}

      <Card title="Your documents" aside={<span className={ui.soft}>{templates.length} ready</span>}>
        {templates.length ? (
          <ul className={ui.list} style={{ display: "grid", gap: 16 }}>
            {templates.map((template) => {
              const boxes = Array.isArray(template.fields) ? template.fields.length : 0;
              const signatures = Array.isArray(template.fields) ? template.fields.filter((field) => field.type === "signature").length : 0;
              return (
                <li key={template.id} className={styles.thumbRow}>
                  <FilePreview src={`/sign/templates/${template.id}/file`} name={`${template.name}.pdf`} />
                  <div className={ui.stack} style={{ gap: 6 }}>
                    <strong>{template.name}</strong>
                    <span className={ui.soft}>
                      {template.page_count} page{template.page_count === 1 ? "" : "s"} · {boxes} box{boxes === 1 ? "" : "es"} · signed by {(template.roles ?? []).join(", ")}
                    </span>
                    {signatures < (template.roles ?? []).length ? <span className={ui.warn}>Needs a signature box for every signer before it can be sent.</span> : null}
                    {canManage ? (
                      <div className={ui.inline}>
                        {signingOn && signatures >= (template.roles ?? []).length ? <Link className={`${ui.btnPrimary} ${ui.small}`} href={`/sign/send/${template.id}`}>Send</Link> : null}
                        <Link className={`${ui.btn} ${ui.small}`} href={`/sign/templates/${template.id}`}>Edit boxes</Link>
                        <ActionForm action={removeTemplate} className={ui.inline}>
                          <input type="hidden" name="template" value={template.id} />
                          <Submit small variant="link" aria-label={`Remove ${template.name}`}>Remove</Submit>
                        </ActionForm>
                      </div>
                    ) : null}
                    {canManage && signatures >= (template.roles ?? []).length ? (
                      <details>
                        <summary className={ui.linkBtn} style={{ cursor: "pointer" }}>
                          Send automatically: {template.pack === "invite" ? "to every new agent" : template.pack === "exit" ? "when an agent leaves" : "never"}
                        </summary>
                        <ActionForm action={setTemplatePack} className={ui.stack} style={{ marginTop: 10 }}>
                          <input type="hidden" name="template" value={template.id} />
                          <label className={ui.field}>
                            Send this by itself
                            <select className={ui.select} name="pack" defaultValue={template.pack ?? "none"}>
                              <option value="none">Never. Only when I choose to</option>
                              <option value="invite">To every new agent, when they are invited</option>
                              <option value="exit">To an agent, when they are marked as leaving</option>
                            </select>
                          </label>
                          {(template.roles ?? []).slice(1).map((role, index) => (
                            <div key={index} className={ui.grid2}>
                              <label className={ui.field}>
                                Who signs as {role}
                                <input className={ui.input} name={`signer_name_${index + 1}`} maxLength={160} defaultValue={template.default_signers?.[index]?.name ?? ""} />
                              </label>
                              <label className={ui.field}>
                                Their email
                                <input className={ui.input} type="email" name={`signer_email_${index + 1}`} maxLength={254} defaultValue={template.default_signers?.[index]?.email ?? ""} />
                              </label>
                            </div>
                          ))}
                          <Submit small>Save</Submit>
                          <p className={ui.help}>The first signer is always the agent. Everyone else is fixed here so nobody has to choose each time.</p>
                        </ActionForm>
                      </details>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>No documents yet. Upload your first PDF below: a rider, a policy, an agreement, anything that needs a signature.</Empty>
        )}
      </Card>

      {canManage ? (
        <Card title="Add a document">
          <ActionForm action={createTemplate} className={ui.stack}>
            <label className={ui.field}>
              Name (optional)
              <input className={ui.input} name="name" maxLength={120} placeholder="For example: Independent contractor agreement" />
            </label>
            <DropZone name="file" label="The PDF to sign" accept="application/pdf" hint="PDF, up to 4 MB" required />
            <Submit busy="Reading the document…">Upload and place boxes</Submit>
            <p className={ui.help}>
              Kinu looks for fill-in fields and for words like Signature, Initials and Date, and places a box on each. You check them on the next screen before anything is sent.
            </p>
          </ActionForm>
        </Card>
      ) : null}

      <Card
        title="Sent for signature"
        aside={canManage && signingOn && waiting.length ? (
          <ActionForm action={checkDocuments} className={ui.inline}><Submit small variant="plain" busy="Checking…">Check now</Submit></ActionForm>
        ) : <span className={ui.soft}>{waiting.length} waiting</span>}
      >
        {sent.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead><tr><th scope="col">Document</th><th scope="col">Signers</th><th scope="col">Status</th><th scope="col">Sent</th>{canManage && <th scope="col">Actions</th>}</tr></thead>
              <tbody>
                {sent.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.title}</td>
                    <td>
                      <ul className={ui.list}>
                        {(doc.signers ?? []).map((signer, index) => <li key={index}>{signer.name}{signer.role ? ` (${signer.role})` : ""}: <strong>{LABEL[signer.status] ?? signer.status}</strong></li>)}
                      </ul>
                    </td>
                    <td><Badge tone={doc.status === "signed" ? "ok" : "muted"}>{LABEL[doc.status] ?? doc.status}</Badge></td>
                    <td>{dayTime(doc.sent_at, tz)}</td>
                    {canManage && (
                      <td>
                        {doc.status === "sent" || doc.status === "opened" ? (
                          <div className={ui.inline}>
                            <ActionForm action={remindDocument} className={ui.inline}><input type="hidden" name="doc" value={doc.id} /><Submit small variant="plain" busy="Sending…" aria-label={`Remind signers of ${doc.title}`}>Remind</Submit></ActionForm>
                            <ActionForm action={cancelDocument} className={ui.inline}><input type="hidden" name="doc" value={doc.id} /><Submit small variant="danger" aria-label={`Cancel ${doc.title}`}>Cancel</Submit></ActionForm>
                          </div>
                        ) : doc.status === "signed" ? <span className={ui.soft}>Filed in the agent’s file</span> : null}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing has been sent yet.</Empty>
        )}
      </Card>
    </div>
  );
}
