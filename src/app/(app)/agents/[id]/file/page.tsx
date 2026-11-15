import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { Badge, ButtonLink, Card, Empty, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { dayTime, titleCase } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import styles from "./file.module.css";

export const metadata: Metadata = { title: "Agent file" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Signature = {
  id: string; subject: string; title: string; method: string; doc_text: string; doc_sha256: string; file_path: string | null; file_sha256: string | null;
  signer_name: string; signer_email: string | null; consent_text: string; ip_address: string | null; user_agent: string | null; signed_at: string; seal: string;
};
type Upload = { id: string; kind: string; filename: string; path: string | null; status: string; note: string | null; created_at: string };
const W9_LABEL: Record<string, string> = { pending: "Not received yet", received: "Received", name_mismatch: "Received · name needs checking" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> };

/**
 * Everything filed under one agent, opened inside the app. Signed documents
 * file themselves here the moment the agent signs; uploads appear as soon as
 * they arrive. Nothing on this page asks for or shows a full taxpayer or bank
 * number, because none is kept.
 */
export default async function AgentFilePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { doc } = await searchParams;
  if (!UUID.test(id)) notFound();
  const access = await requireCap("agents.view");
  const ws = access.workspace.id;
  const tz = access.workspace.timezone;
  const supabase = await createClient();

  const { data: agent } = await supabase.from("agents").select("id, full_name, email, office, w9_status, licence_status, licence_masked").eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!agent) notFound();
  const canFiles = access.caps.has("files.view");
  const [{ data: signatureRows }, { data: uploadRows }] = await Promise.all([
    supabase.from("signatures").select("*").eq("workspace_id", ws).eq("agent_id", id).order("signed_at", { ascending: false }).limit(200),
    canFiles
      ? supabase.from("documents").select("id, kind, filename, path, status, note, created_at").eq("workspace_id", ws).eq("agent_id", id).not("path", "is", null).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as Upload[] }),
  ]);
  const signatures = (signatureRows ?? []) as Signature[];
  const uploads = (uploadRows ?? []) as Upload[];
  const picked = (doc && UUID.test(doc) ? doc : null) ?? signatures[0]?.id ?? uploads[0]?.id ?? null;
  const signature = signatures.find((entry) => entry.id === picked) ?? null;
  const upload = signature ? null : uploads.find((entry) => entry.id === picked) ?? null;
  const here = `/agents/${id}/file`;
  const isImage = Boolean(upload?.path && /\.(png|jpe?g|webp)$/i.test(upload.path));
  const subject = signature ? `${signature.title} · ${agent.full_name}` : upload ? upload.filename : "";
  const mailto = agent.email
    ? `mailto:${encodeURIComponent(agent.email)}?subject=${encodeURIComponent(`Your copy: ${subject}`)}&body=${encodeURIComponent("Your copy is attached.\n\n(Save the PDF from the agent file first, then attach it to this email.)")}`
    : null;

  return (
    <div className={ui.stack}>
      <div data-no-print="">
        <PageHeader eyebrow="Agent file" title={agent.full_name} sub={`${agent.office} · everything signed or uploaded, filed automatically under this agent.`}>
          <ButtonLink href={`/agents/${id}`}>Agent card</ButtonLink>
          <ButtonLink href={`/packet/${id}`}>Paperwork</ButtonLink>
        </PageHeader>
      </div>

      <div className={styles.layout}>
        <div data-no-print="">
          <Card title="In this file" aside={<span className={ui.soft}>{signatures.length + uploads.length} items</span>}>
            {signatures.length + uploads.length === 0 && <Empty>Nothing filed yet. Documents appear here as the agent signs and uploads them.</Empty>}
            {signatures.length > 0 && <p className={styles.group}>Signed and acknowledged</p>}
            <ul className={styles.index}>
              {signatures.map((entry) => (
                <li key={entry.id}>
                  <Link href={`${here}?doc=${entry.id}`} className={entry.id === picked ? styles.on : undefined} aria-current={entry.id === picked ? "page" : undefined}>
                    <b>{entry.title}</b>
                    <span>{entry.method === "acknowledgement" ? "Acknowledged" : "Signed"} · {dayTime(entry.signed_at, tz)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {uploads.length > 0 && <p className={styles.group}>Uploaded</p>}
            <ul className={styles.index}>
              {uploads.map((entry) => (
                <li key={entry.id}>
                  <Link href={`${here}?doc=${entry.id}`} className={entry.id === picked ? styles.on : undefined} aria-current={entry.id === picked ? "page" : undefined}>
                    <b>{entry.filename}</b>
                    <span>{titleCase(entry.kind)} · {dayTime(entry.created_at, tz)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className={styles.group}>Held elsewhere</p>
            <p className={ui.help} style={{ marginLeft: 14 }}>
              W‑9: {W9_LABEL[agent.w9_status] ?? titleCase(agent.w9_status)}. The form itself is kept by the tax‑form provider, so a full
              taxpayer number is never stored here.
            </p>
          </Card>
        </div>

        <div>
          {signature && (
            <>
              <div className={ui.inline} data-no-print="" style={{ marginBottom: 14 }}>
                <PrintButton>Print</PrintButton>
                <a className={ui.btn} href={`/packet/${id}/signed/${signature.id}`}>Save as PDF</a>
                {mailto && <a className={ui.btn} href={mailto}>Email a copy</a>}
                <Badge tone="ok">{signature.method === "acknowledgement" ? "Acknowledged" : "Signed"} · record kept</Badge>
              </div>
              <article className={styles.sheet}>
                <span className="brandLabel">{access.workspace.name}</span>
                <h2>{signature.title}</h2>
                <p>{signature.doc_text}</p>
                {signature.method !== "acknowledgement" && <span className={styles.signed}>{signature.signer_name}</span>}
                <h3>{signature.method === "acknowledgement" ? "Acknowledgement record" : "Signature record"}</h3>
                <dl>
                  <dt>{signature.method === "acknowledgement" ? "Acknowledged by" : "Signed by"}</dt>
                  <dd>{signature.signer_name}</dd>
                  <dt>Email invited</dt>
                  <dd>{signature.signer_email ?? "Not recorded"}</dd>
                  <dt>Date and time</dt>
                  <dd>{dayTime(signature.signed_at, tz)}</dd>
                  <dt>Internet address</dt>
                  <dd>{signature.ip_address ?? "Not recorded"}</dd>
                  <dt>Browser</dt>
                  <dd>{signature.user_agent ?? "Not recorded"}</dd>
                  <dt>Fingerprint of the wording</dt>
                  <dd className={styles.mono}>{signature.doc_sha256}</dd>
                  {signature.file_sha256 && (
                    <>
                      <dt>Fingerprint of the attached document</dt>
                      <dd className={styles.mono}>{signature.file_sha256}</dd>
                    </>
                  )}
                  <dt>Record number</dt>
                  <dd className={styles.mono}>{signature.id}</dd>
                </dl>
                <h3>What they agreed to</h3>
                <p>{signature.consent_text}</p>
                {signature.file_path && <p className={ui.soft}>The brokerage’s own document is included when you save this as a PDF.</p>}
              </article>
            </>
          )}

          {upload && (
            <>
              <div className={ui.inline} data-no-print="" style={{ marginBottom: 14 }}>
                {isImage && <PrintButton>Print</PrintButton>}
                <a className={ui.btn} href={`/files/${upload.id}`} target="_blank" rel="noopener noreferrer">
                  {isImage ? "Open full size" : "Open the PDF"}<span className="sr-only"> (opens in a new tab)</span>
                </a>
                {mailto && <a className={ui.btn} href={mailto}>Email a copy</a>}
                <Badge tone="plain">{titleCase(upload.status)}</Badge>
              </div>
              <article className={styles.sheet}>
                <span className="brandLabel">{titleCase(upload.kind)}</span>
                <h2>{upload.filename}</h2>
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a private file served by our own route, not a site image
                  <img className={styles.photo} src={`/files/${upload.id}`} alt={upload.filename} />
                ) : (
                  <p>This is a PDF the agent uploaded. Use “Open the PDF” to read, print or save it.</p>
                )}
                {upload.note && <p className={ui.soft}>{upload.note}</p>}
              </article>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
