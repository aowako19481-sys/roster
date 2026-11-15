import type { Metadata } from "next";
import { Card, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { Calculator, WireSplitter } from "./Calculator";

export const metadata: Metadata = { title: "GCI calculator" };

export default async function CalculatorPage() {
  await requireCap("deals.view");
  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Finance" title="GCI calculator" sub="Work out payouts, the referral amount and company dollar to the cent, or split one wire across several deals." />
      <Card>
        <p>
          <strong className={ui.strong}>This is a scratchpad.</strong> Nothing typed here is saved or checked against a rider. The deal sheet is the
          record: its rider check and payouts are worked out by the database when the deal is saved.
        </p>
      </Card>
      <Card title="Payouts from a GCI">
        <Calculator />
      </Card>
      <Card title="Split one wire across several deals">
        <WireSplitter />
      </Card>
    </div>
  );
}
