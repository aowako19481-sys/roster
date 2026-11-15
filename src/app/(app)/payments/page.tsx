import type { Metadata } from "next";
import { Badge, Card, Empty, PageHeader, Placeholder, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { dealStatusLabel, dealTypeLabel, paymentMethodLabel } from "@/lib/finance";
import { day, money, todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { PaymentForm } from "./PaymentForm";

export const metadata: Metadata = { title: "Payments" };

type Props = { searchParams: Promise<{ deal?: string | string[] }> };
type Payment = {
  id: string; method: string; amount: number; received_on: string; reference: string | null; proof_path: string | null; explanation: string | null;
};
type DealRow = { id: string; address: string; deal_type: string; status: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaymentsPage({ searchParams }: Props) {
  const access = await requireCap("deals.view");
  const ws = access.workspace.id;
  const canAdd = access.caps.has("payments.manage");
  const wanted = (await searchParams).deal;
  const supabase = await createClient();

  const [{ data: paymentRows }, { data: dealRows }] = await Promise.all([
    supabase.from("payments").select("id, method, amount, received_on, reference, proof_path, explanation")
      .eq("workspace_id", ws).order("received_on", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    canAdd
      ? supabase.from("deals").select("id, address, deal_type, status").eq("workspace_id", ws).neq("status", "closed").order("address").limit(1000)
      : Promise.resolve({ data: [] as DealRow[] }),
  ]);
  const payments = (paymentRows ?? []) as Payment[];
  const deals = (dealRows ?? []) as DealRow[];
  const preselect = typeof wanted === "string" && UUID.test(wanted) && deals.some((deal) => deal.id === wanted) ? wanted : "";

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Finance" title="Payments" sub="Checks, wires and Hyfin payments, matched to deals by address. Never by amount alone." />

      {canAdd && (
        <Card title="Add payment" id="add">
          <div className={ui.form}>
            <Placeholder service="Proof reading">
              Reading the amount, date and method from the uploaded proof automatically will connect here later. Until then, type them in. Even
              when it is connected, the app only suggests: a person always confirms before a payment is recorded.
            </Placeholder>
            {deals.length ? (
              <PaymentForm
                deals={deals.map((deal) => ({ id: deal.id, label: `${deal.address} · ${dealTypeLabel(deal.deal_type)} · ${dealStatusLabel(deal.status)}` }))}
                preselect={preselect}
                today={todayIso(access.workspace.timezone)}
              />
            ) : (
              <Empty>There are no deals to record a payment against yet.</Empty>
            )}
          </div>
        </Card>
      )}

      <Card title="Payments received" aside={<span className={ui.soft}>{payments.length === 200 ? "Latest 200" : `${payments.length} on file`}</span>}>
        {payments.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Received</th>
                  <th scope="col">Method</th>
                  <th scope="col" className={ui.num}>Amount</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Explanation</th>
                  <th scope="col">Proof</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{day(payment.received_on)}</td>
                    <td>{paymentMethodLabel(payment.method)}</td>
                    <td className={`${ui.num} ${ui.strong}`}>{money(payment.amount)}</td>
                    <td className={ui.mono}>{payment.reference ?? "–"}</td>
                    <td>{payment.explanation ?? "–"}</td>
                    <td>{payment.proof_path ? <Badge tone="ok">On file</Badge> : <Badge tone="muted">None</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No payments recorded yet.</Empty>
        )}
      </Card>
    </div>
  );
}
