import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutofillDocument } from "@/components/finance/AutofillDocument";
import { ButtonLink, Card, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { buildBlocks, fillLabels, sampleDocData, unknownTags } from "@/lib/autofill";
import { createClient } from "@/lib/supabase/server";
import { TemplateForm } from "../TemplateForm";

export const metadata: Metadata = { title: "Document layout" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const access = await requireCap("deals.view");
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("doc_templates")
    .select("id, name, body, purpose, attach_proof, attach_receipt, active")
    .eq("id", id)
    .eq("workspace_id", access.workspace.id)
    .maybeSingle();
  if (!template) notFound();

  const canManage = access.caps.has("payroll.manage");
  const sample = sampleDocData(access.workspace.name);
  const unknown = unknownTags(template.body);
  const labels = fillLabels(template.body);

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Autofill document" title={template.name} sub="The layout on the left, and how it comes out for a sample deal on the right.">
        <ButtonLink href="/templates">All documents</ButtonLink>
      </PageHeader>

      {unknown.length > 0 && (
        <Card title="Check these placeholders">
          <p className={ui.error}>
            These are not placeholders this app knows, so they will print exactly as written: <span className={ui.mono}>{unknown.join("  ")}</span>
          </p>
        </Card>
      )}

      <div className={ui.grid2}>
        <Card title={canManage ? "Layout" : "Layout (read-only)"}>
          {canManage ? (
            <TemplateForm template={template} />
          ) : (
            <>
              <pre className={ui.mono} style={{ whiteSpace: "pre-wrap", margin: 0 }}>{template.body}</pre>
              <p className={ui.help} style={{ marginTop: 14 }}>Only a manager can change this layout.</p>
            </>
          )}
          {labels.length > 0 && (
            <p className={ui.help} style={{ marginTop: 14 }}>
              Fill-in boxes on each deal: {labels.join(", ")}.
            </p>
          )}
        </Card>
        <div>
          <p className={`brandLabel ${ui.eyebrow}`} style={{ marginBottom: 12 }}>
            Preview with a sample deal
          </p>
          <AutofillDocument
            title={template.name}
            blocks={buildBlocks(template.body, sample)}
            data={sample}
            filled={{}}
            attachProof={template.attach_proof}
            attachReceipt={template.attach_receipt}
          />
        </div>
      </div>
    </div>
  );
}
