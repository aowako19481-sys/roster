import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, ui } from "@/components/ui";
import { getAccess } from "@/lib/access";

export const metadata: Metadata = { title: "No brokerage yet" };

export default async function NoBrokeragePage() {
  const access = await getAccess();
  if (access?.workspace) redirect("/");
  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Signed in"
        title="No brokerage yet"
        sub="You are signed in, but your account is not linked to a brokerage. Ask your brokerage admin to invite this email address, then sign in again."
      />
    </div>
  );
}
