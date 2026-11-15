"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./DropZone.module.css";

/**
 * A place to drop a file. It waits, visibly, until something is dropped on it
 * or chosen with a click or the keyboard, then shows what it is holding.
 * It is an ordinary file input underneath, so it works in a normal form.
 */
export function DropZone({
  name,
  label,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  hint = "JPEG, PNG, WebP or PDF, up to 10 MB",
  required = false,
}: {
  name: string;
  label: string;
  accept?: string;
  hint?: string;
  required?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [file, setFile] = useState<{ name: string; size: number; preview: string | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const allowed = accept.split(",").map((type) => type.trim());

  function take(list: FileList | null) {
    const picked = list?.[0];
    if (!picked) {
      setFile(null);
      return;
    }
    if (!allowed.includes(picked.type)) {
      setProblem("That type of file cannot be used here.");
      if (input.current) input.current.value = "";
      setFile(null);
      return;
    }
    if (picked.size > 10 * 1024 * 1024) {
      setProblem("That file is larger than 10 MB.");
      if (input.current) input.current.value = "";
      setFile(null);
      return;
    }
    setProblem(null);
    setFile({ name: picked.name, size: picked.size, preview: picked.type.startsWith("image/") ? URL.createObjectURL(picked) : null });
  }

  // Release the preview when it is replaced or the page is left.
  useEffect(() => {
    const url = file?.preview;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  // When the surrounding form is cleared after a save, go back to waiting.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const reset = () => {
      setFile(null);
      setProblem(null);
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  return (
    <div className={styles.wrap}>
      <label
        htmlFor={id}
        className={`${styles.zone} ${over ? styles.over : ""} ${file ? styles.holding : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (input.current && event.dataTransfer.files.length) {
            const transfer = new DataTransfer();
            transfer.items.add(event.dataTransfer.files[0] as File);
            input.current.files = transfer.files;
            take(input.current.files);
          }
        }}
      >
        <span className={styles.label}>{label}</span>
        {file ? (
          <span className={styles.held}>
            {file.preview && (
              // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file, not a site image
              <img src={file.preview} alt="" className={styles.preview} />
            )}
            <span className={styles.heldText}>
              <span className={styles.fileName}>{file.name}</span>
              <span className={styles.hint}>{(file.size / 1024).toFixed(0)} KB · ready to save · drop another file to replace it</span>
            </span>
          </span>
        ) : (
          <span className={styles.waiting}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <span>
              <strong className={styles.strong}>Waiting for a file.</strong> Drop it here, or click to choose one.
            </span>
            <span className={styles.hint}>{hint}</span>
          </span>
        )}
        <input
          ref={input}
          id={id}
          className={styles.input}
          type="file"
          name={name}
          accept={accept}
          required={required}
          onChange={(event) => take(event.currentTarget.files)}
        />
      </label>
      <p className={styles.problem} role="alert">
        {problem}
      </p>
      <p className="sr-only" role="status">
        {file ? `${file.name} is ready to save.` : ""}
      </p>
    </div>
  );
}
