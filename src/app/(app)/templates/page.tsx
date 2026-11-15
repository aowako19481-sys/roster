import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Card, Empty, PageHeader, Placeholder, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { PLACEHOLDERS } from "@/lib/autofill";
import { day } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { DropZone } from "@/components/DropZone";
import { toggleTemplate, uploadPdfTemplate } from "./actions";
import { TemplateForm } from "./TemplateForm";

export const metadata: Metadata = { title: "Autofill documents" };

export default async function TemplatesPage() {
  const access = await requireCap("deals.view");
  const canManage = access.caps.has("payroll.manage");
  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("doc_templates")
    .select("id, name, purpose, attach_proof, attach_receipt, active, updated_at, file_path")
    .eq("workspace_id", access.workspace.id)
    .order("name")
    .limit(100);

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Finance"
        title="Autofill documents"
        sub="Your brokerage's own documents, set up once. For every deal they fill themselves in from the deal's record, with the proof of payment and bank receipt attached."
      />

      <Card title="Your documents" aside={<span className={ui.soft}>{canManage ? "You can set these up" : "Set up by a manager"}</span>}>
        {templates?.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Used as</th>
                  <th scope="col">Attached under it</th>
                  <th scope="col">Last changed</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <th scope="row">
                      <Link href={`/templates/${template.id}`} className={ui.rowLink}>
                        {template.name}
                      </Link>
                    </th>
                    <td>
                      {template.purpose === "deposit_record" ? "Deposit record" : "Deal document"}
                      {template.file_path ? " · PDF form" : ""}
                    </td>
                    <td>
                      {[template.attach_proof && "Proof of payment", template.attach_receipt && "Bank receipt"].filter(Boolean).join(" · ") || "Nothing"}
                    </td>
                    <td>{day(template.updated_at, access.workspace.timezone)}</td>
                    <td>
                      <div className={ui.inline}>
                        <Badge tone={template.active ? "ok" : "muted"}>{template.active ? "In use" : "Switched off"}</Badge>
                        {canManage && (
                          <ActionForm action={toggleTemplate} className={ui.inline}>
                            <input type="hidden" name="id" value={template.id} />
                            <input type="hidden" name="active" value={template.active ? "false" : "true"} />
                            <Submit small variant="plain">
                              {template.active ? "Switch off" : "Switch on"}
                            </Submit>
                          </ActionForm>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No documents yet. {canManage ? "Create your deposit record below." : "A manager can set them up."}</Empty>
        )}
      </Card>

      <div className={ui.split}>
        {canManage ? (
          <Card title="New document">
            <TemplateForm />
          </Card>
        ) : (
          <Card title="Who can set these up">
            <p className={ui.help}>
              Only a manager (the owner or a finance manager) can create or change a document. Everyone who works on
              deals can open the filled-in documents from a deal&apos;s Documents tab.
            </p>
          </Card>
        )}
        <Card title="Placeholders">
          {PLACEHOLDERS.map((group) => (
            <div key={group.group} style={{ marginBottom: 16 }}>
              <p className={`brandLabel ${ui.eyebrow}`}>{group.group}</p>
              <dl className={ui.kv} style={{ marginTop: 8, gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr)" }}>
                {group.items.map((item) => (
                  <div key={item.tag} style={{ display: "contents" }}>
                    <dt className={ui.mono}>{item.tag}</dt>
                    <dd className={ui.soft}>{item.means}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </Card>
      </div>

      {canManage && (
        <Card title="Use your own PDF form" aside={<span className={ui.soft}>Managers only</span>}>
          <p className={ui.help}>
            Already have a designed PDF with fill-in fields? Drop it here. On the next screen you say what goes in each
            field, and every deal can then download it filled in.
          </p>
          <ActionForm action={uploadPdfTemplate}>
            <div className={ui.formRow}>
              <label className={ui.field}>
                Document name
                <input className={ui.input} name="name" required minLength={2} maxLength={80} placeholder="Commission disbursement form" />
              </label>
              <label className={ui.field}>
                Used as
                <select className={ui.select} name="purpose" defaultValue="deal">
                  <option value="deposit_record">The deposit record</option>
                  <option value="deal">Another document for a deal</option>
                </select>
              </label>
            </div>
            <DropZone name="file" label="Your PDF form" accept="application/pdf" required />
            <Submit busy="Reading the PDF…">Upload and set up fields</Submit>
          </ActionForm>
        </Card>
      )}

      <Placeholder service="Word files, and PDFs without fill-in fields">
        A PDF needs fill-in fields for this to work (in Adobe Acrobat: Prepare a form). A flat PDF or a Word file has
        nowhere to put the information: paste its wording into a text layout instead.
      </Placeholder>
    </div>
  );
}
