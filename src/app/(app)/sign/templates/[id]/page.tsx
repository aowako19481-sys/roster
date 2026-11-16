import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, ui } from "@/components/ui";
import { requireWorkspace } from "@/lib/access";
import { documensoReady } from "@/lib/documenso";
import { createClient } from "@/lib/supabase/server";
import { SignEditor, type EditorBox } from "../../SignEditor";

export const metadata: Metadata = { title: "Place signing boxes" };

export default async function TemplateEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ found?: string }> }) {
  const { id } = await params;
  const access = await requireWorkspace();
  if (!access.caps.has("files.manage") && !access.caps.has("riders.manage")) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("sign_templates").select("id, name, roles, fields, created_at, updated_at")
    .eq("id", id).eq("workspace_id", access.workspace.id).eq("active", true).maybeSingle();
  if (!data) notFound();
  const boxes = (Array.isArray(data.fields) ? data.fields : []) as EditorBox[];
  // Straight after upload, say how many boxes came from the PDF's own fill-in fields.
  const fresh = data.created_at === data.updated_at && (await searchParams).found !== "0";
  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Documents to sign" title={data.name as string} sub="Check the boxes Kinu placed, add any that are missing, then save.">
        <Link className={ui.btn} href="/sign">Back to documents</Link>
      </PageHeader>
      <SignEditor
        templateId={data.id as string}
        fileUrl={`/sign/templates/${data.id}/file`}
        name={data.name as string}
        roles={(data.roles as string[]) ?? ["Agent"]}
        boxes={boxes}
        fromForm={fresh ? boxes.length : 0}
        signingOn={documensoReady()}
      />
    </div>
  );
}
