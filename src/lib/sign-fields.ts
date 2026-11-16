import "server-only";
import { PDFDocument, PDFSignature, PDFTextField } from "pdf-lib";
import type { BoxType } from "@/lib/documenso";

/** One box on a document to sign. Places are in percent of the page, from its top-left corner. */
export type SignBox = { type: BoxType; role: number; page: number; x: number; y: number; w: number; h: number; label?: string; required?: boolean };

export const BOX_TYPES: BoxType[] = ["signature", "initials", "name", "date", "text", "email"];
const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

/** Reads a list of boxes sent by the browser and keeps only what is valid. Returns null if it is not a list. */
export function readBoxes(value: unknown, roleCount: number, pages: number): SignBox[] | null {
  if (!Array.isArray(value) || value.length > 300) return null;
  const boxes: SignBox[] = [];
  for (const raw of value as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object") return null;
    const type = BOX_TYPES.find((entry) => entry === raw.type);
    const [role, page, x, y, w, h] = [raw.role, raw.page, raw.x, raw.y, raw.w, raw.h].map(Number) as [number, number, number, number, number, number];
    if (!type || ![role, page, x, y, w, h].every(Number.isFinite)) return null;
    if (!Number.isInteger(role) || role < 0 || role >= roleCount || !Number.isInteger(page) || page < 1 || page > pages) return null;
    const width = clamp(w, 1, 100), height = clamp(h, 0.5, 100);
    boxes.push({
      type, role, page, x: round(clamp(x, 0, 100 - width)), y: round(clamp(y, 0, 100 - height)), w: round(width), h: round(height),
      ...(typeof raw.label === "string" && raw.label.trim() ? { label: raw.label.trim().slice(0, 80) } : {}),
      ...(type === "text" ? { required: raw.required !== false } : {}),
    });
  }
  return boxes;
}

const guess = (name: string): BoxType =>
  /initial/i.test(name) ? "initials" : /date/i.test(name) ? "date" : /sign/i.test(name) ? "signature" : /e-?mail/i.test(name) ? "email" : /name/i.test(name) ? "name" : "text";

/**
 * Opens a PDF, counts its pages and finds the boxes it already has as form
 * fields (many brokerage forms do). Each one becomes a suggested box in the
 * same place. Returns null if the PDF is locked or damaged.
 */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pages: number; boxes: SignBox[] } | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
  } catch {
    return null;
  }
  const pages = doc.getPages();
  const boxes: SignBox[] = [];
  try {
    for (const field of doc.getForm().getFields()) {
      const isSignature = field instanceof PDFSignature;
      if (!isSignature && !(field instanceof PDFTextField)) continue;
      const name = field.getName();
      for (const widget of field.acroField.getWidgets()) {
        const owner = widget.P();
        const ref = doc.context.getObjectRef(widget.dict);
        let index = owner ? pages.findIndex((page) => page.ref === owner) : -1;
        if (index < 0 && ref) index = pages.findIndex((page) => page.node.Annots()?.asArray().includes(ref) ?? false);
        if (index < 0) continue;
        const { width: pw, height: ph } = pages[index]!.getSize();
        const rect = widget.getRectangle();
        const w = clamp((Math.abs(rect.width) / pw) * 100, 1, 100), h = clamp((Math.abs(rect.height) / ph) * 100, 0.5, 100);
        const type = isSignature ? "signature" : guess(name);
        boxes.push({
          type, role: 0, page: index + 1, x: round(clamp((rect.x / pw) * 100, 0, 100 - w)), y: round(clamp(((ph - rect.y - Math.abs(rect.height)) / ph) * 100, 0, 100 - h)), w: round(w), h: round(h),
          ...(type === "text" ? { label: name.replace(/[_.\[\]]+/g, " ").trim().slice(0, 80), required: false } : {}),
        });
        if (boxes.length >= 300) break;
      }
    }
  } catch { /* a form we cannot read: the person places the boxes by hand */ }
  return { pages: pages.length, boxes };
}

/** The PDF as it is sent: any fill-in fields are fixed in place, so the signing boxes sit on a plain page. */
export async function flattened(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const doc = await PDFDocument.load(bytes);
    try { doc.getForm().flatten(); } catch { /* nothing to flatten */ }
    return await doc.save();
  } catch {
    return bytes;
  }
}
