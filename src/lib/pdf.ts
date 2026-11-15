import "server-only";
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFRadioGroup, PDFTextField, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * PDF work, all on our own server (the pdf-lib package; nothing is sent
 * anywhere). Two jobs: the signed record an agent or the brokerage can keep,
 * and filling in a brokerage's own PDF form for a deal.
 */

// The built-in PDF fonts only cover Western European characters. Anything
// else is replaced so a document is always produced rather than failing.
const EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function plain(text: string) {
  return [...text.replace(/\t/g, "  ")].map((char) => {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || EXTRA.has(char)) return char;
    return code < 0x20 ? "" : "?";
  }).join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of plain(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      let piece = word;
      // A single very long word (a fingerprint, a browser name) is cut to fit.
      while (font.widthOfTextAtSize(piece, size) > width) {
        let cut = piece.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(piece.slice(0, cut), size) > width) cut -= 1;
        if (line) { lines.push(line); line = ""; }
        lines.push(piece.slice(0, cut));
        piece = piece.slice(cut);
      }
      const next = line ? `${line} ${piece}` : piece;
      if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = piece; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

const PAGE = { width: 612, height: 792, margin: 56 };

/** Writes flowing text onto as many pages as it needs. */
class Writer {
  page: PDFPage;
  y: number;
  constructor(private doc: PDFDocument, private regular: PDFFont, private bold: PDFFont) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }
  private room(height: number) {
    if (this.y - height < PAGE.margin) {
      this.page = this.doc.addPage([PAGE.width, PAGE.height]);
      this.y = PAGE.height - PAGE.margin;
    }
  }
  text(value: string, options: { size?: number; bold?: boolean; soft?: boolean; gap?: number } = {}) {
    const size = options.size ?? 10.5;
    const font = options.bold ? this.bold : this.regular;
    for (const line of wrap(value, font, size, PAGE.width - PAGE.margin * 2)) {
      this.room(size * 1.45);
      this.y -= size * 1.45;
      if (line) this.page.drawText(line, { x: PAGE.margin, y: this.y, size, font, color: options.soft ? rgb(0.4, 0.4, 0.4) : rgb(0.1, 0.1, 0.1) });
    }
    this.y -= options.gap ?? 0;
  }
  rule() {
    this.room(18);
    this.y -= 10;
    this.page.drawLine({ start: { x: PAGE.margin, y: this.y }, end: { x: PAGE.width - PAGE.margin, y: this.y }, thickness: 0.6, color: rgb(0.6, 0.6, 0.6) });
    this.y -= 8;
  }
}

export type SignatureRecord = {
  id: string; subject: string; subject_id: string | null; title: string; method: string; doc_text: string; doc_sha256: string;
  file_path: string | null; file_sha256: string | null; signer_name: string; signer_email: string | null;
  consent_text: string; ip_address: string | null; user_agent: string | null; signed_at: string; seal: string;
  brokerage?: string;
};

/**
 * The signed record as a PDF: the document that was signed (the brokerage's
 * own PDF when there was one), followed by a signature certificate.
 */
export async function signedRecordPdf(record: SignatureRecord, brokerage: string, original: Uint8Array | null): Promise<Uint8Array> {
  let doc: PDFDocument | null = null;
  let originalIncluded = false;
  if (original) {
    try {
      doc = await PDFDocument.load(original);
      originalIncluded = true;
    } catch {
      doc = null;   // locked or damaged: the certificate still names its fingerprint
    }
  }
  doc ??= await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, regular, bold);
  const acknowledged = record.method === "acknowledgement";

  w.text(brokerage, { size: 9, soft: true });
  w.text(acknowledged ? "Acknowledgement record" : "Signature certificate", { size: 18, bold: true, gap: 6 });
  w.text(record.title, { size: 12, bold: true, gap: 8 });

  const signedAt = new Date(record.signed_at);
  const rows: [string, string][] = [
    [acknowledged ? "Acknowledged by" : "Signed by", record.signer_name],
    ["Email the invitation was sent to", record.signer_email ?? "Not recorded"],
    ["Date and time (UTC)", Number.isNaN(signedAt.getTime()) ? record.signed_at : signedAt.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC")],
    ["How", acknowledged ? "Ticked a box confirming they read it, from their private onboarding link" : "Typed their full legal name and ticked a box agreeing to sign electronically, from their private onboarding link"],
    ["Internet address", record.ip_address ?? "Not recorded"],
    ["Browser", record.user_agent ?? "Not recorded"],
    ["Record number", record.id],
  ];
  for (const [label, value] of rows) {
    w.text(label, { size: 8.5, soft: true });
    w.text(value, { gap: 5 });
  }
  w.rule();
  w.text("What they agreed to", { size: 8.5, soft: true });
  w.text(record.consent_text, { gap: 6 });
  w.rule();
  w.text("Fingerprints (SHA-256)", { size: 8.5, soft: true });
  w.text(`Wording signed: ${record.doc_sha256}`, { size: 8.5 });
  if (record.file_sha256) w.text(`Attached document: ${record.file_sha256}`, { size: 8.5 });
  w.text(`Whole record: ${record.seal}`, { size: 8.5, gap: 6 });
  w.text(
    "A fingerprint changes if even one character of what it covers changes. This record is kept by the brokerage and cannot be edited after signing." +
      (record.file_path ? (originalIncluded ? " The document signed is included in this file, before this page." : " The document signed is kept on file by the brokerage; its fingerprint is above.") : ""),
    { size: 8.5, soft: true },
  );

  w.rule();
  w.text("Wording signed", { size: 8.5, soft: true });
  w.text(record.doc_text);
  if (!acknowledged) {
    w.text("");
    w.text(`Signed electronically: ${record.signer_name}`, { bold: true });
  }
  doc.setTitle(plain(`${record.title} - ${record.signer_name}`));
  doc.setProducer("Kinu");
  return doc.save();
}

// ------------------------------------------------------------- PDF forms --

export type PdfField = { name: string; type: "text" | "checkbox" | "choice" };

/** The form fields in a PDF, or a plain-words reason it cannot be used. */
export async function readPdfFields(bytes: Uint8Array): Promise<{ fields: PdfField[] } | { message: string }> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
  } catch {
    return { message: "That PDF is locked with a password or damaged. Save an unlocked copy and try again." };
  }
  const fields: PdfField[] = [];
  for (const field of doc.getForm().getFields()) {
    const name = field.getName();
    if (!name || name.length > 200) continue;
    if (field instanceof PDFTextField) fields.push({ name, type: "text" });
    else if (field instanceof PDFCheckBox) fields.push({ name, type: "checkbox" });
    else if (field instanceof PDFDropdown || field instanceof PDFRadioGroup) fields.push({ name, type: "choice" });
  }
  if (!fields.length) {
    return { message: "That PDF has no fill-in fields. Add form fields to it first (Adobe Acrobat: Prepare a form), or write the layout as text instead." };
  }
  return { fields: fields.slice(0, 300) };
}

/** Fills a PDF form. Values are plain text; the result can no longer be edited. */
export async function fillPdf(bytes: Uint8Array, values: Record<string, string>): Promise<Uint8Array | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
  } catch {
    return null;
  }
  const form = doc.getForm();
  for (const field of form.getFields()) {
    const value = values[field.getName()];
    if (value === undefined || value === "") continue;
    try {
      if (field instanceof PDFTextField) {
        const text = plain(field.isMultiline() ? value : value.replace(/\n/g, "; "));
        const max = field.getMaxLength();
        field.setText(max ? text.slice(0, max) : text);
      } else if (field instanceof PDFCheckBox) {
        if (/^(yes|y|true|x|on|1)$/i.test(value.trim())) field.check();
      } else if (field instanceof PDFDropdown || field instanceof PDFRadioGroup) {
        const option = field.getOptions().find((entry) => entry.toLowerCase() === value.trim().toLowerCase());
        if (option) field.select(option);
      }
    } catch {
      // One awkward field must not stop the rest of the document.
    }
  }
  try {
    form.flatten();
  } catch {
    // Some forms cannot be flattened; the filled values are still saved.
  }
  return doc.save();
}

/** A PDF response that downloads and cannot run anything. */
export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  const safe = filename.normalize("NFKD").replace(/[^A-Za-z0-9._ -]+/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "document";
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safe}.pdf"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
