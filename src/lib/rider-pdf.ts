import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Box } from "@/lib/documenso";
import { plain } from "@/lib/pdf";

export type RiderTerms = {
  brokerage: string; signer: string; subject: string; teamName: string | null; version: number; splitPct: number;
  tiers: { from: number; to: number | null; pct: number }[];
};

const W = 612, H = 792, M = 56;
const money = (n: number) => "$" + n.toLocaleString("en-US");

/**
 * The document a person signs: the brokerage's own rider (if they uploaded
 * one), followed by a schedule page with this person's numbers and the place
 * to sign. Built on our own server. Returns where the three boxes go.
 */
export async function riderPdf(terms: RiderTerms, template: Uint8Array | null): Promise<{ bytes: Uint8Array; usedTemplate: boolean; boxes: { signature: Box; name: Box; date: Box } }> {
  let doc: PDFDocument | null = null;
  if (template) {
    try {
      doc = await PDFDocument.load(template);
      // Any fill-in fields on the brokerage's form are fixed in place so nothing can be typed over later.
      try { doc.getForm().flatten(); } catch { /* no form, or one that cannot be flattened */ }
    } catch {
      doc = null;   // locked or damaged: fall back to the schedule alone
    }
  }
  const usedTemplate = doc !== null;
  doc ??= await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([W, H]);
  const ink = rgb(0.09, 0.09, 0.1), soft = rgb(0.4, 0.4, 0.42);
  let y = H - M;
  const line = (text: string, size = 10.5, font = regular, color = ink, gap = 6) => {
    y -= size * 1.35;
    page.drawText(plain(text).slice(0, 110), { x: M, y, size, font, color });
    y -= gap;
  };
  const row = (label: string, value: string) => {
    y -= 16;
    page.drawText(plain(label), { x: M, y, size: 9.5, font: regular, color: soft });
    page.drawText(plain(value).slice(0, 70), { x: M + 170, y, size: 10.5, font: regular, color: ink });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: rgb(0.82, 0.82, 0.84) });
  };

  line(terms.brokerage, 9, regular, soft, 2);
  line(usedTemplate ? "Rider schedule and signature" : "Commission rider", 20, bold, ink, 10);
  line(usedTemplate
    ? "This page is part of the rider on the pages before it. It sets out the terms that apply to the person named below."
    : "This rider sets out the commission terms that apply to the person named below.", 10, regular, soft, 8);

  row("Applies to", terms.subject + (terms.teamName ? ` (team: ${terms.teamName})` : ""));
  row("Signed by", terms.signer);
  row("Rider version", `v${terms.version}`);
  row("Commission split", `${terms.splitPct}% to the agent`);
  if (terms.tiers.length) {
    y -= 8;
    line("Tiers", 9.5, regular, soft, 0);
    for (const tier of terms.tiers.slice(0, 12)) {
      row(tier.to === null ? `From ${money(tier.from)}` : `${money(tier.from)} to ${money(tier.to)}`, `${tier.pct}% to the agent`);
    }
  }
  y -= 14;
  line("By signing below I agree to these terms. They take effect when everyone asked to sign has signed.", 10, regular, ink, 0);

  // The signing block sits at a fixed place near the bottom, clear of the text above.
  const boxes = {
    signature: { page: doc.getPageCount(), x: 9.2, y: 70, width: 44, height: 8 },
    name: { page: doc.getPageCount(), x: 9.2, y: 83, width: 44, height: 4 },
    date: { page: doc.getPageCount(), x: 58, y: 83, width: 28, height: 4 },
  };
  const label = (text: string, box: Box) => {
    const top = H * (1 - box.y / 100), left = W * (box.x / 100);
    page.drawText(text, { x: left, y: top + 5, size: 8.5, font: regular, color: soft });
    const bottom = top - H * (box.height / 100);
    page.drawLine({ start: { x: left, y: bottom }, end: { x: left + W * (box.width / 100), y: bottom }, thickness: 0.7, color: ink });
  };
  label("Signature", boxes.signature);
  label("Printed name", boxes.name);
  label("Date", boxes.date);

  doc.setTitle(plain(`Rider v${terms.version} - ${terms.signer}`));
  doc.setProducer("Kinu");
  return { bytes: await doc.save(), usedTemplate, boxes };
}
