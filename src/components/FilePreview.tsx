"use client";

import { useEffect, useRef, useState } from "react";
import { drawPage, openPdf, type OpenPdf } from "@/lib/pdf-view";
import styles from "./FilePreview.module.css";

/**
 * A small picture of a stored file (the first page of a PDF, or the image
 * itself). Click it to read the whole thing large, inside Kinu.
 */
export function FilePreview({ src, name, kind = "pdf", width = 96 }: { src: string; name: string; kind?: "pdf" | "image"; width?: number }) {
  const thumb = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<OpenPdf | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [near, setNear] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  // Long lists: a preview is only drawn once it is about to scroll into view.
  useEffect(() => {
    const element = button.current;
    if (!element) return;
    const watcher = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setNear(true); watcher.disconnect(); } }, { rootMargin: "300px" });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);

  useEffect(() => {
    if (kind !== "pdf" || !near) return;
    let gone = false;
    openPdf(src)
      .then(async (loaded) => {
        if (gone) return;
        setDoc(loaded);
        if (thumb.current) await drawPage(loaded, 1, thumb.current, width);
      })
      .catch(() => { if (!gone) setFailed(true); });
    return () => { gone = true; };
  }, [src, kind, width, near]);

  // Draw every page when the large view opens.
  useEffect(() => {
    if (!open || !doc || !pages.current) return;
    let gone = false;
    const holder = pages.current;
    holder.replaceChildren();
    (async () => {
      const wide = Math.min(900, holder.clientWidth || 900);
      for (let n = 1; n <= Math.min(doc.numPages, 60) && !gone; n += 1) {
        const canvas = document.createElement("canvas");
        canvas.className = styles.page ?? "";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Page ${n} of ${doc.numPages}`);
        holder.appendChild(canvas);
        await drawPage(doc, n, canvas, wide);
      }
    })();
    return () => { gone = true; };
  }, [open, doc]);

  const show = () => { setOpen(true); dialog.current?.showModal(); };
  const hide = () => { dialog.current?.close(); };

  return (
    <>
      <button ref={button} type="button" className={styles.thumb} style={{ width }} onClick={show} aria-label={`Open ${name}`}>
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- a private file served by our own route
          near ? <img src={src} alt="" className={styles.image} /> : <span className={styles.none}>…</span>
        ) : failed ? (
          <span className={styles.none}>PDF</span>
        ) : (
          <canvas ref={thumb} aria-hidden="true" />
        )}
      </button>
      <dialog ref={dialog} className={styles.viewer} aria-label={name} onClose={() => setOpen(false)}>
        <div className={styles.bar}>
          <strong className={styles.name}>{name}</strong>
          <a className={styles.action} href={src} download={name}>Download</a>
          <button type="button" className={styles.action} onClick={hide} autoFocus>Close</button>
        </div>
        <div className={styles.scroll}>
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private file served by our own route
            open ? <img src={src} alt={name} className={styles.full} /> : null
          ) : failed ? (
            <p className={styles.note}>This file cannot be shown here. Use Download to open it.</p>
          ) : (
            <div ref={pages} className={styles.pages} />
          )}
        </div>
      </dialog>
    </>
  );
}
