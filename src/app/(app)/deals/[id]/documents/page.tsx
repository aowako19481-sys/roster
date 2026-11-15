import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { DropZone } from "@/components/DropZone";
import { AutofillDocument } from "@/components/finance/AutofillDocument";
import { PrintButton } from "@/components/PrintButton";
import { Badge, ButtonLink, Card, Empty, PageHeader, Tabs, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { buildBlocks, fillLabels, loadDealDocData, METHOD_LABEL } from "@/lib/autofill";
import { day, dayTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { attachFile, removeFile, saveFilled } from "./actions";

export const metadata: Metadata = { title: "Deal documents" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string; doc?: string }> };

export default async function DealDocumentsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { show, doc } = await searchParams;
  if (!UUID.test(id)) notFound();
  const access = await requireCap("deals.view");
  const ws = access.workspace.id;
  const supabase = await createClient();

  const data = await loadDealDocData(supabase, ws, id);
  if (!data) notFound();

  const [{ data: templates }, { data: values }] = await Promise.all([
    supabase.from("doc_templates").select("id, name, body, purpose, attach_proof, attach_receipt").eq("workspace_id", ws).eq("active", true).order("purpose", { ascending: false }).order("name").limit(50),
    supabase.from("deal_doc_values").select("template_id, filled").eq("deal_id", id).eq("workspace_id", ws).limit(50),
  ]);
  const list = templates ?? [];
  const filledOf = new Map((values ?? []).map((row) => [row.template_id as string, (row.filled ?? {}) as Record<string, string>]));

  const wantsReceipt = list.some((template) => template.attach_receipt);
  const section = show === "proof" ? "proof" : show === "receipt" && wantsReceipt ? "receipt" : "record";
  const current = list.find((template) => template.id === doc) ?? list[0];
  const here = `/deals/${id}/documents`;

  const canAttach = access.caps.has("payments.manage");
  const canFill = access.caps.has("deals.edit") && !["processed", "closed"].includes(data.deal.status);
  const frozen = ["processed", "closed"].includes(data.deal.status);

  const proofs = data.documents.filter((file) => file.kind === "payment_proof");
  const receipts = data.documents.filter((file) => file.kind === "bank_receipt");
  const paymentProofs = data.payments.filter((payment) => payment.has_proof);

  const fileList = (files: typeof proofs) => (
    <ul className={ui.list}>
      {files.map((file) => (
        <li key={file.id}>
          <div className={ui.inline} style={{ justifyContent: "space-between" }}>
            <span>
              <a href={`${here}/${file.id}`} className={ui.rowLink} target="_blank" rel="noopener noreferrer">
                {file.filename}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <span className={ui.soft}> · added {dayTime(file.created_at, access.workspace.timezone)}</span>
            </span>
            {canAttach && !frozen && (
              <ActionForm action={removeFile} className={ui.inline}>
                <input type="hidden" name="doc" value={file.id} />
                <input type="hidden" name="deal" value={id} />
                <Submit small variant="link">
                  Remove
                </Submit>
              </ActionForm>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={ui.stack}>
      <div data-no-print="">
        <PageHeader eyebrow="Deal documents" title={data.deal.address} sub="The deposit record fills itself in from this deal. Proof of payment and the bank receipt are kept with it.">
          <ButtonLink href="/deals">All deals</ButtonLink>
        </PageHeader>
      </div>
      <div data-no-print="">
        <Tabs items={[{ href: `/deals/${id}`, label: "Deal sheet" }, { href: here, label: "Documents" }]} current={here} />
      </div>

      <nav className={ui.tabs} aria-label="Documents for this deal" data-no-print="">
        <Link href={here} className={section === "record" ? ui.tabOn : ui.tab} aria-current={section === "record" ? "page" : undefined}>
          Deposit record
        </Link>
        <Link href={`${here}?show=proof`} className={section === "proof" ? ui.tabOn : ui.tab} aria-current={section === "proof" ? "page" : undefined}>
          Proof of payment ({proofs.length + paymentProofs.length})
        </Link>
        {wantsReceipt && (
          <Link href={`${here}?show=receipt`} className={section === "receipt" ? ui.tabOn : ui.tab} aria-current={section === "receipt" ? "page" : undefined}>
            Bank receipt ({receipts.length})
          </Link>
        )}
      </nav>

      {section === "record" &&
        (current ? (
          <>
            <div className={ui.inline} data-no-print="">
              {list.length > 1 && (
                <nav className={ui.tabs} aria-label="Which document">
                  {list.map((template) => (
                    <Link key={template.id} href={`${here}?doc=${template.id}`} className={template.id === current.id ? ui.tabOn : ui.tab}>
                      {template.name}
                    </Link>
                  ))}
                </nav>
              )}
              <PrintButton />
              {access.caps.has("payroll.manage") && <ButtonLink href={`/templates/${current.id}`}>Change the layout</ButtonLink>}
            </div>

            {fillLabels(current.body).length > 0 && (
              <div data-no-print="">
                <Card title="Fill in for this deal" aside={<span className={ui.soft}>Everything else fills itself in</span>}>
                  {canFill ? (
                    <ActionForm action={saveFilled}>
                      <input type="hidden" name="deal" value={id} />
                      <input type="hidden" name="template" value={current.id} />
                      <div className={ui.formRow}>
                        {fillLabels(current.body).map((label, index) => (
                          <label key={label} className={ui.field}>
                            {label}
                            <input className={ui.input} name={`fill_${index}`} defaultValue={filledOf.get(current.id)?.[label] ?? ""} maxLength={300} />
                          </label>
                        ))}
                      </div>
                      <Submit small>Save to the document</Submit>
                    </ActionForm>
                  ) : (
                    <p className={ui.help}>{frozen ? "This deal is in a payroll, so its document can no longer be changed." : "Your role can view this document but not fill it in."}</p>
                  )}
                </Card>
              </div>
            )}

            <AutofillDocument
              title={current.name}
              blocks={buildBlocks(current.body, data)}
              data={data}
              filled={filledOf.get(current.id) ?? {}}
              attachProof={current.attach_proof}
              attachReceipt={current.attach_receipt}
              fileBase={here}
            />
          </>
        ) : (
          <Card title="No deposit record set up yet">
            <Empty>
              A manager sets up the brokerage&apos;s deposit record once, under Finance → Documents. After that it fills itself
              in here for every deal.
            </Empty>
            {access.caps.has("payroll.manage") && <ButtonLink href="/templates" primary>Set up the deposit record</ButtonLink>}
          </Card>
        ))}

      {section === "proof" && (
        <Card title="Proof of payment" aside={<Badge tone={proofs.length + paymentProofs.length ? "ok" : "plain"}>{proofs.length + paymentProofs.length ? "On file" : "Waiting"}</Badge>}>
          {proofs.length > 0 && fileList(proofs)}
          {paymentProofs.length > 0 && (
            <ul className={ui.list}>
              {paymentProofs.map((payment) => (
                <li key={payment.payment_id}>
                  <a href={`/payments/${payment.payment_id}/proof`} className={ui.rowLink} target="_blank" rel="noopener noreferrer">
                    Proof stored with the {METHOD_LABEL[payment.method] ?? payment.method} payment of {day(payment.received_on)}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  {payment.reference && <span className={ui.soft}> · {payment.reference}</span>}
                </li>
              ))}
            </ul>
          )}
          {proofs.length + paymentProofs.length === 0 && <Empty>No proof of payment yet.</Empty>}
          {canAttach ? (
            <ActionForm action={attachFile} resetOnSuccess style={{ marginTop: 16 }}>
              <input type="hidden" name="deal" value={id} />
              <input type="hidden" name="kind" value="payment_proof" />
              <DropZone name="file" label="Check image, wire confirmation or Hyfin proof" required />
              <Submit busy="Saving…">Attach proof of payment</Submit>
            </ActionForm>
          ) : (
            <p className={ui.help}>Your role can view proofs but not add them.</p>
          )}
        </Card>
      )}

      {section === "receipt" && (
        <Card title="Bank receipt" aside={<Badge tone={receipts.length ? "ok" : "plain"}>{receipts.length ? "On file" : "Waiting"}</Badge>}>
          <p className={ui.help}>The bank&apos;s receipt for this deposit. It prints under the deposit record.</p>
          {receipts.length > 0 ? fileList(receipts) : <Empty>No bank receipt yet.</Empty>}
          {canAttach ? (
            <ActionForm action={attachFile} resetOnSuccess style={{ marginTop: 16 }}>
              <input type="hidden" name="deal" value={id} />
              <input type="hidden" name="kind" value="bank_receipt" />
              <DropZone name="file" label="Bank receipt" required />
              <Submit busy="Saving…">Attach bank receipt</Submit>
            </ActionForm>
          ) : (
            <p className={ui.help}>Your role can view the receipt but not add one.</p>
          )}
        </Card>
      )}
    </div>
  );
}
