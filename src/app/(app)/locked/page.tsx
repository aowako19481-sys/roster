import type { Metadata } from "next";
import { ButtonLink, Card, PageHeader, Placeholder, ui } from "@/components/ui";
import { getAccess } from "@/lib/access";
import { BRAND } from "@/lib/brand";
import { CAPS, productOfCap, type Cap } from "@/lib/roles";

export const metadata: Metadata = { title: "Locked" };

type Props = { searchParams: Promise<{ need?: string; addon?: string; page?: string }> };

const ADDON_NAMES: Record<string, string> = {
  retention: "Retention Insights + Exit Kit",
  finance_shield: "Finance Shield",
  compliance: "Compliance pack",
};

export default async function LockedPage({ searchParams }: Props) {
  const { need, addon, page } = await searchParams;
  const access = await getAccess();
  const ws = access?.workspace;
  const cap = (CAPS as readonly string[]).includes(need ?? "") ? (need as Cap) : null;

  // Is this locked because the brokerage has not bought it, or because of the person's role?
  const product = cap ? productOfCap(cap) : null;
  const notBought =
    Boolean(addon && ADDON_NAMES[addon]) || Boolean(page) ||
    (product === "finance" && ws && !ws.hasFinance) || (product === "ops" && ws && !ws.hasOps);
  // Only fixed names are ever shown; nothing typed into the address bar is echoed.
  const what = addon && ADDON_NAMES[addon] ? ADDON_NAMES[addon] : product === "finance" || page ? "This part of " + BRAND : "This page";

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow={notBought ? "Locked preview" : "Not available to your role"}
        title={notBought ? "Not in your plan yet" : "You do not have access"}
        sub={
          notBought
            ? `${what} is not part of this brokerage's plan. Book a call and we will switch it on.`
            : "Your role in this brokerage does not include this page. Ask your brokerage admin if you need it."
        }
      >
        <ButtonLink href="/">Back to home</ButtonLink>
      </PageHeader>
      {notBought && (
        <Card title="Book a call">
          <Placeholder service="Booking and billing">
            The “Book a call” button and plan upgrades will connect to a scheduling link and Stripe. For now, your {BRAND}{" "}
            contact can switch products and add-ons on from the {BRAND} console.
          </Placeholder>
        </Card>
      )}
    </div>
  );
}
