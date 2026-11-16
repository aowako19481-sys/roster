/**
 * Draws PDF pages on screen with Mozilla's pdf.js. The library and its worker
 * are served from our own site (public/pdf.worker.min.mjs); nothing is loaded
 * from anywhere else. Only used in the browser.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;
function pdfjs() {
  lib ??= import("pdfjs-dist").then((loaded) => {
    loaded.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return loaded;
  });
  return lib;
}

export type OpenPdf = PDFDocumentProxy;

export async function openPdf(source: string | Uint8Array): Promise<OpenPdf> {
  const viewer = await pdfjs();
  const options = { isEvalSupported: false, useWasm: false, ...(typeof source === "string" ? { url: source } : { data: source }) };
  return viewer.getDocument(options).promise;
}

/** Draws one page into a canvas at the given on-screen width. Returns the page's own size in points. */
export async function drawPage(doc: OpenPdf, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const sharp = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * sharp });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(cssWidth * base.height) / base.width}px`;
  const context = canvas.getContext("2d");
  if (!context) return { width: base.width, height: base.height };
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return { width: base.width, height: base.height };
}
