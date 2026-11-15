import type { Block, DealDocData } from "@/lib/autofill";
import { day, money, pct } from "@/lib/format";
import styles from "./AutofillDocument.module.css";

const METHOD: Record<string, string> = { check: "Check", wire: "Wire", hyfin: "Hyfin" };

/**
 * A brokerage's own document, filled in for one deal. Every figure comes
 * from the database. Fill-in boxes show what was typed for this deal, or a
 * blank line to write on.
 */
export function AutofillDocument({
  title,
  blocks,
  data,
  filled,
  attachProof,
  attachReceipt,
  fileBase,
}: {
  title: string;
  blocks: Block[];
  data: DealDocData;
  filled: Record<string, string>;
  attachProof: boolean;
  attachReceipt: boolean;
  /** Address prefix for this deal's stored files, e.g. /deals/<id>/documents. Omit in previews. */
  fileBase?: string;
}) {
  const received = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const has = (kind: Block["kind"]) => blocks.some((block) => block.kind === kind);

  const files = (kind: "payment_proof" | "bank_receipt", label: string) => {
    const docs = data.documents.filter((doc) => doc.kind === kind && doc.path);
    const fromPayments = kind === "payment_proof" ? data.payments.filter((payment) => payment.has_proof) : [];
    return (
      <section className={styles.attached}>
        <h3 className={styles.h3}>{label}</h3>
        {docs.length === 0 && fromPayments.length === 0 && <p className={styles.none}>None attached yet.</p>}
        {docs.map((doc) =>
          fileBase && /\.(jpg|png|webp)$/.test(doc.path ?? "") ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private file served by our own route, not a site image
            <img key={doc.id} className={styles.image} src={`${fileBase}/${doc.id}`} alt={`${label}: ${doc.filename}`} />
          ) : (
            <p key={doc.id} className={styles.none}>{doc.filename} (attached as a separate file)</p>
          ),
        )}
        {fromPayments.map((payment) => (
          <p key={payment.payment_id} className={styles.none}>
            Proof on file with the {METHOD[payment.method] ?? payment.method} payment of {day(payment.received_on)}
            {payment.reference ? ` (${payment.reference})` : ""}
          </p>
        ))}
      </section>
    );
  };

  return (
    <article className={styles.sheet} aria-label={`${title} for ${data.deal.address}`}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "space":
            return <div key={index} className={styles.space} />;
          case "rule":
            return <hr key={index} className={styles.rule} />;
          case "title":
          case "heading":
          case "line": {
            const Tag = block.kind === "title" ? "h2" : block.kind === "heading" ? "h3" : "p";
            const cls = block.kind === "title" ? styles.title : block.kind === "heading" ? styles.h3 : styles.line;
            return (
              <Tag key={index} className={cls}>
                {block.parts.map((part, at) =>
                  part.kind === "text" ? (
                    <span key={at}>{part.text}</span>
                  ) : part.kind === "fill" ? (
                    filled[part.label] ? (
                      <span key={at} className={styles.filled}>{filled[part.label]}</span>
                    ) : (
                      <span key={at} className={styles.blank} aria-label={`${part.label}: not filled in`} />
                    )
                  ) : (
                    <mark key={at} className={styles.unknown}>{part.text}</mark>
                  ),
                )}
              </Tag>
            );
          }
          case "payments_table":
            return data.payments.length ? (
              <table key={index} className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Method</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Explanation</th>
                    <th scope="col" className={styles.num}>To this deal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((payment, at) => (
                    <tr key={at}>
                      <td>{day(payment.received_on)}</td>
                      <td>{METHOD[payment.method] ?? payment.method}</td>
                      <td>{payment.reference ?? "–"}</td>
                      <td>{payment.explanation ?? "–"}</td>
                      <td className={styles.num}>{money(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={4}>Total received</th>
                    <td className={styles.num}>{money(received)}</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p key={index} className={styles.none}>No payment recorded yet.</p>
            );
          case "agents_table":
          case "payouts_table": {
            const money_ = block.kind === "payouts_table";
            return (
              <table key={index} className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Agent</th>
                    <th scope="col">Paid as</th>
                    <th scope="col" className={styles.num}>Share of deal</th>
                    {money_ && (
                      <>
                        <th scope="col" className={styles.num}>Split</th>
                        <th scope="col" className={styles.num}>Payout</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line, at) => (
                    <tr key={at}>
                      <th scope="row">{line.name}</th>
                      <td>{line.basis === "team" ? "Team" : "Individual"}</td>
                      <td className={styles.num}>{pct(line.share_pct)}</td>
                      {money_ && (
                        <>
                          <td className={styles.num}>{pct(line.split_pct)}</td>
                          <td className={styles.num}>{money(line.payout)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          }
          case "referral_lines":
            return data.referrals.length ? (
              <table key={index} className={styles.table}>
                <tbody>
                  {data.referrals.map((fee, at) => (
                    <tr key={at}>
                      <th scope="row">{fee.payee}</th>
                      <td className={styles.num}>{money(fee.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p key={index} className={styles.none}>None.</p>
            );
          case "signature_lines":
            return (
              <div key={index} className={styles.signatures}>
                <div><span className={styles.sigLine} />Prepared by</div>
                <div><span className={styles.sigLine} />Approved by</div>
                <div><span className={styles.sigLine} />Date</div>
              </div>
            );
          case "proof_of_payment":
            return <div key={index}>{files("payment_proof", "Proof of payment")}</div>;
          case "bank_receipt":
            return <div key={index}>{files("bank_receipt", "Bank receipt")}</div>;
          default:
            return null;
        }
      })}
      {attachProof && !has("proof_of_payment") && files("payment_proof", "Proof of payment")}
      {attachReceipt && !has("bank_receipt") && files("bank_receipt", "Bank receipt")}
    </article>
  );
}
