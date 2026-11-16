"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionForm, Submit } from "@/components/ActionForm";
import ui from "@/components/ui.module.css";
import { drawPage, openPdf, type OpenPdf } from "@/lib/pdf-view";
import { saveTemplate } from "./actions";
import styles from "./sign.module.css";

type BoxType = "signature" | "initials" | "name" | "date" | "text" | "email";
export type EditorBox = { type: BoxType; role: number; page: number; x: number; y: number; w: number; h: number; label?: string; required?: boolean };
type Box = EditorBox & { id: number };

const TYPES: { type: BoxType; label: string; w: number; h: number }[] = [
  { type: "signature", label: "Signature", w: 28, h: 4.6 },
  { type: "initials", label: "Initials", w: 9, h: 3.6 },
  { type: "name", label: "Printed name", w: 24, h: 2.8 },
  { type: "date", label: "Date signed", w: 14, h: 2.8 },
  { type: "text", label: "Text to fill in", w: 24, h: 2.8 },
  { type: "email", label: "Email", w: 26, h: 2.8 },
];
const labelOf = (type: BoxType) => TYPES.find((entry) => entry.type === type)?.label ?? type;
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const round = (n: number) => Math.round(n * 100) / 100;
let counter = 1;
const newId = () => counter++;
const bare = ({ type, role, page, x, y, w, h, label, required }: Box): EditorBox => ({ type, role, page, x, y, w, h, ...(label !== undefined ? { label } : {}), ...(required !== undefined ? { required } : {}) });

const guess = (words: string): BoxType | null =>
  /initial/i.test(words) ? "initials" : /sign(ature|ed|\s*here)?\b/i.test(words) ? "signature" : /\bdate/i.test(words) ? "date" : /e-?mail/i.test(words) ? "email" : /name/i.test(words) ? "name" : null;

/** Reads the words on every page and suggests a box beside "Signature", "Date", "Initials", "Name" and blank underlines. */
async function suggest(doc: OpenPdf, roles: string[], existing: EditorBox[]): Promise<EditorBox[]> {
  const found: EditorBox[] = [];
  const second = Math.max(0, roles.findIndex((role) => /broker|company|manager|office|principal/i.test(role)));
  for (let n = 1; n <= Math.min(doc.numPages, 80); n += 1) {
    const page = await doc.getPage(n);
    const { width: W, height: H } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = (content.items as { str?: string; transform?: number[]; width?: number; height?: number }[])
      .filter((item) => typeof item.str === "string" && Array.isArray(item.transform))
      .map((item) => ({ str: item.str as string, x: item.transform![4] ?? 0, y: item.transform![5] ?? 0, width: item.width ?? 0, size: Math.abs(item.transform![3] ?? 10) || 10 }));
    const lineOf = (y: number) => items.filter((item) => Math.abs(item.y - y) < 3).sort((a, b) => a.x - b.x);
    const add = (type: BoxType, left: number, baseline: number, wide: number, tall: number, line: string, label?: string) => {
      const w = clamp((wide / W) * 100, 4, 60), h = clamp((tall / H) * 100, 1.6, 8);
      const x = clamp((left / W) * 100, 0, 100 - w), y = clamp(((H - baseline - tall + 2) / H) * 100, 0, 100 - h);
      const overlaps = [...existing, ...found].some((box) => box.page === n && box.x < x + w && x < box.x + box.w && box.y < y + h && y < box.y + box.h);
      if (overlaps) return;
      const role = roles.length > 1 && /broker|company|manager|office|principal|witness/i.test(line) ? second : 0;
      found.push({ type, role, page: n, x: round(x), y: round(y), w: round(w), h: round(h), ...(type === "text" ? { label: (label ?? "").slice(0, 80), required: false } : {}) });
    };
    for (const item of items) {
      const line = lineOf(item.y), words = line.map((entry) => entry.str).join(" ");
      const blank = item.str.match(/_{5,}/);
      if (blank) {
        // A blank underline: the words just before it say what goes there.
        const each = item.width / Math.max(1, item.str.length);
        const before = item.str.slice(0, blank.index).trim() || [...line].reverse().find((entry) => entry.x < item.x && entry.str.trim())?.str.trim() || "";
        const after = line.find((entry) => entry.x > item.x && entry.str.trim() && !/_{3,}/.test(entry.str))?.str.trim() ?? "";
        const type = guess(before) ?? guess(after) ?? "text";
        const tall = type === "signature" ? Math.max(26, item.size * 2.2) : type === "initials" ? 22 : Math.max(16, item.size * 1.5);
        add(type, item.x + (blank.index ?? 0) * each, item.y, Math.max(40, blank[0].length * each), tall, words, before.replace(/[:_]+$/, "").trim());
      } else if (/^\s*(x\s*)?(agent|broker|buyer|seller|tenant|landlord|client)?['’]?s?\s*(signature|sign here)\s*:?\s*$/i.test(item.str) && !line.some((entry) => /_{5,}/.test(entry.str))) {
        add("signature", item.x + item.width + 8, item.y, 190, 28, words);
      }
      if (found.length >= 120) return found;
    }
  }
  return found;
}

export function SignEditor({ templateId, fileUrl, name, roles: firstRoles, boxes: firstBoxes, fromForm, signingOn }: {
  templateId: string; fileUrl: string; name: string; roles: string[]; boxes: EditorBox[]; fromForm: number; signingOn: boolean;
}) {
  const [doc, setDoc] = useState<OpenPdf | null>(null);
  const [problem, setProblem] = useState("");
  const [roles, setRoles] = useState<string[]>(firstRoles.length ? firstRoles : ["Agent"]);
  const [boxes, setBoxes] = useState<Box[]>(() => firstBoxes.map((box) => ({ ...box, id: newId() })));
  const [selected, setSelected] = useState<number | null>(null);
  const [tool, setTool] = useState<BoxType | null>(null);
  const [activeRole, setActiveRole] = useState(0);
  const [note, setNote] = useState(fromForm ? `Kinu found ${fromForm} fill-in field${fromForm === 1 ? "" : "s"} in this PDF and placed a box on each. Check them, then save.` : "");
  const [dirty, setDirty] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const canvases = useRef(new Map<number, HTMLCanvasElement>());
  const searched = useRef(false);

  const change = useCallback((next: Box[] | ((current: Box[]) => Box[])) => { setBoxes(next); setDirty(true); }, []);

  const find = useCallback(async (loaded: OpenPdf, current: Box[], currentRoles: string[], quiet: boolean) => {
    const more = await suggest(loaded, currentRoles, current).catch(() => [] as EditorBox[]);
    if (more.length) {
      change([...current, ...more.map((box) => ({ ...box, id: newId() }))]);
      setNote(`Kinu suggested ${more.length} box${more.length === 1 ? "" : "es"} from the words on the page (Signature, Date, Initials, Name and blank lines). Check each one: move, resize or delete, then save.`);
    } else if (!quiet) setNote("No more places were found automatically. Pick a box type on the left, then click on the page where it goes.");
  }, [change]);

  useEffect(() => {
    let gone = false;
    openPdf(fileUrl)
      .then(async (loaded) => {
        if (gone) return;
        setDoc(loaded);
        const wide = Math.min(880, (holder.current?.clientWidth ?? 880) - 2);
        for (let n = 1; n <= loaded.numPages && !gone; n += 1) {
          const canvas = canvases.current.get(n);
          if (canvas) await drawPage(loaded, n, canvas, wide);
        }
        // A new document with no boxes yet: look for the places to sign straight away.
        if (!gone && !searched.current && !firstBoxes.length) {
          searched.current = true;
          await find(loaded, [], firstRoles.length ? firstRoles : ["Agent"], true);
        }
      })
      .catch(() => { if (!gone) setProblem("This PDF could not be shown. Upload it again as an unlocked PDF."); });
    return () => { gone = true; };
    // Only when the file changes: the first boxes and roles are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  const pageCount = doc?.numPages ?? 0;
  const update = (id: number, patch: Partial<Box>) => change((current) => current.map((box) => (box.id === id ? { ...box, ...patch } : box)));
  const remove = (id: number) => { change((current) => current.filter((box) => box.id !== id)); setSelected(null); };
  const current = boxes.find((box) => box.id === selected) ?? null;

  function place(event: React.PointerEvent<HTMLDivElement>, page: number) {
    if (!tool || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const size = TYPES.find((entry) => entry.type === tool)!;
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100 - size.w / 2, 0, 100 - size.w);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100 - size.h / 2, 0, 100 - size.h);
    const id = newId();
    change((list) => [...list, { id, type: tool, role: activeRole, page, x: round(x), y: round(y), w: size.w, h: size.h, ...(tool === "text" ? { label: "", required: true } : {}) }]);
    setSelected(id);
    setTool(null);
  }

  function drag(event: React.PointerEvent<HTMLElement>, box: Box, resize: boolean) {
    event.preventDefault();
    event.stopPropagation();
    setSelected(box.id);
    const layer = (event.currentTarget.closest("[data-layer]") as HTMLElement).getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moved: PointerEvent) => {
      const dx = ((moved.clientX - start.x) / layer.width) * 100, dy = ((moved.clientY - start.y) / layer.height) * 100;
      if (resize) update(box.id, { w: round(clamp(box.w + dx, 2, 100 - box.x)), h: round(clamp(box.h + dy, 1, 100 - box.y)) });
      else update(box.id, { x: round(clamp(box.x + dx, 0, 100 - box.w)), y: round(clamp(box.y + dy, 0, 100 - box.h)) });
    };
    const stop = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", stop); target.removeEventListener("pointercancel", stop); };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", stop);
    target.addEventListener("pointercancel", stop);
  }

  function keys(event: React.KeyboardEvent, box: Box) {
    const step = event.altKey ? 0.1 : 0.5;
    const by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (by) {
      event.preventDefault();
      if (event.shiftKey) update(box.id, { w: round(clamp(box.w + by[0]!, 2, 100 - box.x)), h: round(clamp(box.h + by[1]!, 1, 100 - box.y)) });
      else update(box.id, { x: round(clamp(box.x + by[0]!, 0, 100 - box.w)), y: round(clamp(box.y + by[1]!, 0, 100 - box.h)) });
    } else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(box.id); }
  }

  const missing = roles.filter((_, index) => !boxes.some((box) => box.role === index && box.type === "signature"));

  return (
    <div className={styles.editor}>
      <aside className={styles.panel} aria-label="Document settings">
        <ActionForm action={saveTemplate} className={ui.stack} onSubmit={() => setDirty(false)}>
          <input type="hidden" name="template" value={templateId} />
          <input type="hidden" name="roles" value={JSON.stringify(roles)} />
          <input type="hidden" name="boxes" value={JSON.stringify(boxes.map(bare))} />
          <label className={ui.field}>
            Document name
            <input className={ui.input} name="name" defaultValue={name} required minLength={2} maxLength={120} onChange={() => setDirty(true)} />
          </label>
          <Submit busy="Saving…">{dirty ? "Save changes" : "Saved"}</Submit>
        </ActionForm>
        {missing.length ? <p className={styles.warn} role="status">Still needs a signature box for: {missing.join(", ")}.</p> : null}
        {signingOn && !missing.length && !dirty ? <Link className={ui.btnPrimary} href={`/sign/send/${templateId}`}>Send this document</Link> : null}

        <section aria-label="Who signs">
          <h3 className={styles.h}>Who signs</h3>
          <ul className={styles.roles}>
            {roles.map((role, index) => (
              <li key={index} className={styles.roleRow}>
                <button type="button" className={`${styles.swatch} ${styles[`r${index}`]} ${activeRole === index ? styles.on : ""}`} aria-pressed={activeRole === index} aria-label={`New boxes are for ${role}`} onClick={() => setActiveRole(index)}>{index + 1}</button>
                <input className={ui.input} aria-label={`Name of signer ${index + 1}`} value={role} maxLength={40} onChange={(event) => { const next = [...roles]; next[index] = event.target.value; setRoles(next); setDirty(true); }} />
                {roles.length > 1 && !boxes.some((box) => box.role === index) && index === roles.length - 1 ? (
                  <button type="button" className={ui.linkBtn} onClick={() => { setRoles(roles.slice(0, -1)); setActiveRole(0); setDirty(true); }} aria-label={`Remove ${role}`}>Remove</button>
                ) : null}
              </li>
            ))}
          </ul>
          {roles.length < 6 ? <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => { setRoles([...roles, roles.length === 1 ? "Broker" : `Signer ${roles.length + 1}`]); setActiveRole(roles.length); setDirty(true); }}>Add another signer</button> : null}
          <p className={ui.help}>Press a number to choose who the next box is for.</p>
        </section>

        <section aria-label="Add a box">
          <h3 className={styles.h}>Add a box</h3>
          <div className={styles.tools}>
            {TYPES.map((entry) => (
              <button key={entry.type} type="button" className={`${styles.tool} ${tool === entry.type ? styles.on : ""}`} aria-pressed={tool === entry.type} onClick={() => setTool(tool === entry.type ? null : entry.type)}>{entry.label}</button>
            ))}
          </div>
          <p className={ui.help} role="status">{tool ? `Now click on the page where the ${labelOf(tool).toLowerCase()} box for ${roles[activeRole]} goes.` : "Pick a type, then click on the page."}</p>
          <button type="button" className={`${ui.btn} ${ui.small}`} disabled={!doc} onClick={() => doc && void find(doc, boxes, roles, false)}>Find boxes automatically</button>
        </section>

        {current ? (
          <section aria-label="Selected box" className={styles.selected}>
            <h3 className={styles.h}>Selected box · page {current.page}</h3>
            <label className={ui.field}>
              Type
              <select className={ui.input} value={current.type} onChange={(event) => update(current.id, { type: event.target.value as BoxType })}>
                {TYPES.map((entry) => <option key={entry.type} value={entry.type}>{entry.label}</option>)}
              </select>
            </label>
            <label className={ui.field}>
              Signed by
              <select className={ui.input} value={current.role} onChange={(event) => update(current.id, { role: Number(event.target.value) })}>
                {roles.map((role, index) => <option key={index} value={index}>{role}</option>)}
              </select>
            </label>
            {current.type === "text" ? (
              <>
                <label className={ui.field}>
                  What should they type here
                  <input className={ui.input} value={current.label ?? ""} maxLength={80} placeholder="For example: Licence number" onChange={(event) => update(current.id, { label: event.target.value })} />
                </label>
                <label className={ui.check}>
                  <input type="checkbox" checked={current.required !== false} onChange={(event) => update(current.id, { required: event.target.checked })} /> Must be filled in
                </label>
              </>
            ) : null}
            <button type="button" className={`${ui.btnDanger} ${ui.small}`} onClick={() => remove(current.id)}>Delete this box</button>
            <p className={ui.help}>Drag to move. Drag the corner to resize. Arrow keys move it; Shift + arrows resize; Delete removes it.</p>
          </section>
        ) : null}
      </aside>

      <div className={styles.pages} ref={holder}>
        {note ? <p className={styles.note} role="status">{note}</p> : null}
        {problem ? <p className={ui.error} role="alert">{problem}</p> : null}
        {!doc && !problem ? <p className={ui.soft}>Opening the document…</p> : null}
        {Array.from({ length: pageCount || 1 }, (_, index) => index + 1).map((page) => (
          <div key={page} className={styles.sheet}>
            <p className={styles.pageNo}>Page {page}{pageCount ? ` of ${pageCount}` : ""}</p>
            <div className={styles.paper}>
              <canvas ref={(element) => { if (element) canvases.current.set(page, element); else canvases.current.delete(page); }} role="img" aria-label={`Page ${page} of the document`} />
              <div data-layer="" className={`${styles.layer} ${tool ? styles.placing : ""}`} onPointerDown={(event) => place(event, page)}>
                {boxes.filter((box) => box.page === page).map((box) => (
                  <div
                    key={box.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${labelOf(box.type)} box for ${roles[box.role] ?? "signer"}, page ${page}`}
                    aria-pressed={selected === box.id}
                    className={`${styles.box} ${styles[`r${box.role}`]} ${selected === box.id ? styles.picked : ""}`}
                    style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
                    onPointerDown={(event) => drag(event, box, false)}
                    onFocus={() => setSelected(box.id)}
                    onKeyDown={(event) => keys(event, box)}
                  >
                    <span className={styles.tag}>{box.type === "text" && box.label ? box.label : labelOf(box.type)} · {roles[box.role] ?? ""}</span>
                    <span className={styles.grip} aria-hidden="true" onPointerDown={(event) => drag(event, box, true)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
